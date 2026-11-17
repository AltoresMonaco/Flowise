import { Request, Response } from 'express'

const mockGetChatflowByIdForWorkspace = jest.fn()
const mockTranscribe = jest.fn()
const mockValidateFlowAPIKey = jest.fn()

jest.mock('flowise-components', () => ({
    isValidUUID: (id: string) => /^[0-9a-f-]{36}$/.test(id)
}))
jest.mock('../../services/chatflows', () => ({
    __esModule: true,
    default: { getChatflowByIdForWorkspace: mockGetChatflowByIdForWorkspace }
}))
jest.mock('../../services/speech-to-text', () => ({
    __esModule: true,
    SPEECH_TO_TEXT_NOT_CONFIGURED: 'speech_to_text_not_configured',
    default: { transcribe: mockTranscribe }
}))
jest.mock('../../utils/validateKey', () => ({ validateFlowAPIKey: mockValidateFlowAPIKey }))

import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import speechToTextController from './index'

const CHATFLOW_ID = '3f0c1d0e-8a52-4d0b-9d59-0f6f3a1b2c3d'
const body = { data: 'data:audio/mpeg;base64,AAAA', name: 'call.mp3', mime: 'audio/mpeg', language: 'fr' }

const call = async (overrides: Record<string, any> = {}) => {
    const req = {
        params: { id: CHATFLOW_ID },
        body,
        user: { activeWorkspaceId: 'ws-1', activeOrganizationId: 'org-1' },
        ...overrides
    } as unknown as Request
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() } as unknown as Response
    const next = jest.fn()
    await speechToTextController.transcribe(req, res, next)
    return { res, next }
}

describe('speechToTextController.transcribe', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockGetChatflowByIdForWorkspace.mockResolvedValue({ id: CHATFLOW_ID })
        mockValidateFlowAPIKey.mockResolvedValue(true)
    })

    it('returns the transcript of a chatflow looked up in the caller workspace', async () => {
        mockTranscribe.mockResolvedValue('bonjour')
        const { res, next } = await call()
        expect(mockGetChatflowByIdForWorkspace).toHaveBeenCalledWith(CHATFLOW_ID, 'ws-1')
        expect(mockTranscribe).toHaveBeenCalledWith(
            { id: CHATFLOW_ID },
            { data: body.data, name: 'call.mp3', mime: 'audio/mpeg', type: 'file' },
            'org-1',
            'fr'
        )
        expect(res.json).toHaveBeenCalledWith({ text: 'bonjour' })
        expect(next).not.toHaveBeenCalled()
    })

    it('answers 422 with a code when no provider is enabled', async () => {
        mockTranscribe.mockRejectedValue(new InternalFlowiseError(422, 'speech_to_text_not_configured'))
        const { res, next } = await call()
        expect(res.status).toHaveBeenCalledWith(422)
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'speech_to_text_not_configured' }))
        expect(next).not.toHaveBeenCalled()
    })

    it.each([
        ['a malformed chatflow id', { params: { id: 'nope' } }, 404],
        ['a request without audio', { body: { name: 'call.mp3' } }, 400],
        ['a caller without workspace', { user: undefined }, 401]
    ])('rejects %s', async (_label, overrides, statusCode) => {
        const { next } = await call(overrides)
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode }))
        expect(mockTranscribe).not.toHaveBeenCalled()
    })

    it('passes on the 404 of a chatflow that is not in the caller workspace', async () => {
        mockGetChatflowByIdForWorkspace.mockRejectedValue(new InternalFlowiseError(404, 'not found'))
        const { next } = await call()
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }))
    })

    it('refuses a chatflow bound to another API key', async () => {
        mockValidateFlowAPIKey.mockResolvedValue(false)
        const { next } = await call()
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }))
        expect(mockTranscribe).not.toHaveBeenCalled()
    })
})
