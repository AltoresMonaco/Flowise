import { AIMessage, BaseMessage, ToolMessage } from '@langchain/core/messages'

/**
 * Rebuilds the tool calls of a stored assistant turn as real tool messages.
 *
 * Flowise stores each assistant turn with the tools it called (`usedTools`: tool name,
 * input and output) but memory nodes replayed only the final text, so on the next turn
 * the model no longer saw what its tools had returned and called them all again. With
 * this replay the history carries, before the final answer, one assistant message
 * holding the tool calls and one tool message per result, the way agents such as
 * Claude Code or Codex keep tool results in their context.
 *
 * Flowise does not store tool call ids, so stable ids are derived from the stored
 * message id. Several sequential steps of one turn are replayed as a single batch of
 * calls: the order is kept, which is what the model needs to reuse the results.
 */

export const DEFAULT_MAX_TOOL_OUTPUT_CHARS = 8000

export interface ToolReplayOptions {
    /** Replay the tool calls stored with each assistant message. Off by default. */
    replayToolCalls?: boolean
    /** Longest tool result replayed, in characters; longer ones are cut. */
    maxToolOutputChars?: number
}

interface StoredToolCall {
    tool?: string
    toolInput?: unknown
    toolOutput?: unknown
}

const NO_OUTPUT = 'No result was recorded for this call (it failed or returned nothing).'

const parseUsedTools = (usedTools: unknown): StoredToolCall[] => {
    if (!usedTools) return []
    let parsed = usedTools
    if (typeof usedTools === 'string') {
        try {
            parsed = JSON.parse(usedTools)
        } catch {
            return []
        }
    }
    if (!Array.isArray(parsed)) return []
    return parsed.filter((t): t is StoredToolCall => !!t && typeof t === 'object' && typeof (t as StoredToolCall).tool === 'string')
}

const toArgs = (input: unknown): Record<string, unknown> => {
    if (input && typeof input === 'object' && !Array.isArray(input)) return input as Record<string, unknown>
    if (input === undefined || input === null || input === '') return {}
    if (typeof input === 'string') {
        try {
            const parsed = JSON.parse(input)
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
        } catch {
            // plain string input, wrapped below
        }
    }
    return { input }
}

const toContent = (output: unknown, maxChars: number): string => {
    if (output === undefined || output === null || output === '') return NO_OUTPUT
    const text = typeof output === 'string' ? output : JSON.stringify(output)
    if (maxChars <= 0 || text.length <= maxChars) return text
    return `${text.slice(0, maxChars)}\n[... ${text.length - maxChars} more characters cut from this stored result]`
}

// Tool names sent to model providers must match ^[a-zA-Z0-9_-]+$.
const safeName = (name: string): string => name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'tool'

/**
 * Messages to insert before the final assistant text of a stored turn: an assistant
 * message carrying the calls, then one tool message per call. Empty when the turn
 * used no tool.
 */
export const buildToolReplayMessages = (
    usedTools: unknown,
    messageId: string | undefined,
    maxToolOutputChars: number = DEFAULT_MAX_TOOL_OUTPUT_CHARS
): BaseMessage[] => {
    const calls = parseUsedTools(usedTools)
    if (!calls.length) return []
    const prefix = `replay_${
        String(messageId ?? '')
            .replace(/[^a-zA-Z0-9]/g, '')
            .slice(0, 12) || 'msg'
    }`
    const withIds = calls.map((call, i) => ({ ...call, id: `${prefix}_${i}`, name: safeName(call.tool as string) }))
    return [
        new AIMessage({
            content: '',
            tool_calls: withIds.map((c) => ({ id: c.id, name: c.name, args: toArgs(c.toolInput), type: 'tool_call' as const }))
        }),
        ...withIds.map((c) => new ToolMessage({ content: toContent(c.toolOutput, maxToolOutputChars), tool_call_id: c.id, name: c.name }))
    ]
}

/** Node inputs shared by the memory nodes that support the replay. */
export const toolReplayInputs = [
    {
        label: 'Replay Tool Calls',
        name: 'replayToolCalls',
        type: 'boolean' as const,
        description:
            'Give the model, on every turn, the tools it called in earlier turns and what they returned, so it can reuse them instead of calling them again.',
        default: false,
        optional: true,
        additionalParams: true
    },
    {
        label: 'Max Characters per Replayed Tool Result',
        name: 'maxToolOutputChars',
        type: 'number' as const,
        description: `Longer stored results are cut. Default ${DEFAULT_MAX_TOOL_OUTPUT_CHARS}.`,
        default: DEFAULT_MAX_TOOL_OUTPUT_CHARS,
        optional: true,
        additionalParams: true
    }
]

/** Reads the replay inputs of a memory node. */
export const readToolReplayInputs = (inputs: Record<string, unknown> | undefined): ToolReplayOptions => {
    const raw = inputs?.replayToolCalls
    const max = parseInt(String(inputs?.maxToolOutputChars ?? ''), 10)
    return {
        replayToolCalls: raw === true || raw === 'true',
        maxToolOutputChars: Number.isFinite(max) && max > 0 ? max : DEFAULT_MAX_TOOL_OUTPUT_CHARS
    }
}
