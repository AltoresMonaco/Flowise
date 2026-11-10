import { AIMessage, ToolMessage } from '@langchain/core/messages'
import { buildToolReplayMessages, readToolReplayInputs, DEFAULT_MAX_TOOL_OUTPUT_CHARS } from './toolReplay'

describe('buildToolReplayMessages', () => {
    const stored = JSON.stringify([
        { tool: 'odoo_list_workshops', toolInput: {}, toolOutput: '[{"id":3,"name":"Lyon Part-Dieu"}]' },
        { tool: 'odoo_find_partner_by_phone', toolInput: { phone_e164: '+33600000022' }, toolOutput: { found: false } }
    ])

    it('returns nothing when the turn used no tool', () => {
        expect(buildToolReplayMessages(undefined, 'm1')).toEqual([])
        expect(buildToolReplayMessages('[]', 'm1')).toEqual([])
        expect(buildToolReplayMessages('not json', 'm1')).toEqual([])
    })

    it('replays one assistant message with the calls, then one tool message per result, ids matching', () => {
        const msgs = buildToolReplayMessages(stored, 'a1b2-c3d4')
        expect(msgs).toHaveLength(3)
        const ai = msgs[0] as AIMessage
        expect(ai).toBeInstanceOf(AIMessage)
        expect(ai.tool_calls?.map((c) => c.name)).toEqual(['odoo_list_workshops', 'odoo_find_partner_by_phone'])
        expect(ai.tool_calls?.[1].args).toEqual({ phone_e164: '+33600000022' })
        const results = msgs.slice(1) as ToolMessage[]
        results.forEach((m, i) => {
            expect(m).toBeInstanceOf(ToolMessage)
            expect(m.tool_call_id).toBe(ai.tool_calls?.[i].id)
        })
        expect(results[0].content).toBe('[{"id":3,"name":"Lyon Part-Dieu"}]')
        expect(results[1].content).toBe('{"found":false}')
    })

    it('derives the same ids from the same stored message, so the history is stable across turns', () => {
        const a = (buildToolReplayMessages(stored, 'msg-42')[0] as AIMessage).tool_calls?.map((c) => c.id)
        const b = (buildToolReplayMessages(stored, 'msg-42')[0] as AIMessage).tool_calls?.map((c) => c.id)
        expect(a).toEqual(b)
        expect(a?.[0]).toMatch(/^[a-zA-Z0-9_]+$/)
    })

    it('says so when a call left no result (failed tool)', () => {
        const msgs = buildToolReplayMessages([{ tool: 'odoo_list_workshops', toolInput: {} }], 'm')
        expect(String((msgs[1] as ToolMessage).content)).toMatch(/No result was recorded/)
    })

    it('cuts long results and says how much was cut', () => {
        const long = 'x'.repeat(50)
        const msgs = buildToolReplayMessages([{ tool: 't', toolInput: {}, toolOutput: long }], 'm', 20)
        expect(String((msgs[1] as ToolMessage).content)).toBe(`${'x'.repeat(20)}\n[... 30 more characters cut from this stored result]`)
    })

    it('wraps a plain string input and cleans tool names the providers would refuse', () => {
        const msgs = buildToolReplayMessages([{ tool: 'my tool.v2', toolInput: 'hello', toolOutput: 'ok' }], 'm')
        const call = (msgs[0] as AIMessage).tool_calls?.[0]
        expect(call?.name).toBe('my_tool_v2')
        expect(call?.args).toEqual({ input: 'hello' })
    })
})

describe('readToolReplayInputs', () => {
    it('is off by default', () => {
        expect(readToolReplayInputs(undefined)).toEqual({ replayToolCalls: false, maxToolOutputChars: DEFAULT_MAX_TOOL_OUTPUT_CHARS })
    })

    it('reads the switch and the limit as the UI stores them', () => {
        expect(readToolReplayInputs({ replayToolCalls: true, maxToolOutputChars: '500' })).toEqual({
            replayToolCalls: true,
            maxToolOutputChars: 500
        })
        expect(readToolReplayInputs({ replayToolCalls: 'true', maxToolOutputChars: 'abc' }).maxToolOutputChars).toBe(
            DEFAULT_MAX_TOOL_OUTPUT_CHARS
        )
    })
})
