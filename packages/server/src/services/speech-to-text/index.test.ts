const mockConvertSpeechToText = jest.fn()

jest.mock('flowise-components', () => ({
    convertSpeechToText: mockConvertSpeechToText
}))
jest.mock('../../utils', () => ({ databaseEntities: {} }))
jest.mock('../../utils/getRunningExpressApp', () => ({
    getRunningExpressApp: () => ({ AppDataSource: {} })
}))
jest.mock('../../database/entities/ChatFlow', () => ({ ChatFlow: class ChatFlow {} }))

import speechToTextService, { SPEECH_TO_TEXT_NOT_CONFIGURED } from './index'

const audio = Buffer.from('fake audio bytes')
const upload = { data: `data:audio/mpeg;base64,${audio.toString('base64')}`, name: 'call.mp3', mime: 'audio/mpeg', type: 'file' }
const chatflowWith = (speechToText?: object): any => ({ id: 'chatflow-1', speechToText: speechToText && JSON.stringify(speechToText) })

describe('speechToTextService.transcribe', () => {
    beforeEach(() => jest.clearAllMocks())

    it.each([[undefined], [{}], [{ openAIWhisper: { status: false, credentialId: 'c1' } }]])(
        'rejects a chatflow without an enabled provider (%j)',
        async (speechToText) => {
            await expect(speechToTextService.transcribe(chatflowWith(speechToText), upload)).rejects.toMatchObject({
                statusCode: 422,
                message: SPEECH_TO_TEXT_NOT_CONFIGURED
            })
            expect(mockConvertSpeechToText).not.toHaveBeenCalled()
        }
    )

    it('transcribes the decoded audio in memory with the enabled provider', async () => {
        mockConvertSpeechToText.mockResolvedValue('bonjour')
        const chatflow = chatflowWith({
            groqWhisper: { status: false, credentialId: 'c0' },
            openAIWhisper: { status: true, credentialId: 'c1', language: 'en' }
        })

        await expect(speechToTextService.transcribe(chatflow, upload, 'org-1')).resolves.toBe('bonjour')

        const [passedUpload, config, options] = mockConvertSpeechToText.mock.calls[0]
        expect(passedUpload).toMatchObject({ name: 'call.mp3', mime: 'audio/mpeg' })
        expect(config).toMatchObject({ name: 'openAIWhisper', credentialId: 'c1', language: 'en' })
        expect(options.audioBuffer.equals(audio)).toBe(true)
        expect(options).toMatchObject({ orgId: 'org-1', chatflowid: 'chatflow-1' })
    })

    it('lets the request language override the configured one', async () => {
        mockConvertSpeechToText.mockResolvedValue('bonjour')
        await speechToTextService.transcribe(chatflowWith({ openAIWhisper: { status: true, language: 'en' } }), upload, 'org-1', 'fr')
        expect(mockConvertSpeechToText.mock.calls[0][1].language).toBe('fr')
    })

    it('keeps the configured locale for Azure, which does not take ISO 639-1 codes', async () => {
        mockConvertSpeechToText.mockResolvedValue('bonjour')
        await speechToTextService.transcribe(chatflowWith({ azureCognitive: { status: true, language: 'fr-FR' } }), upload, 'org-1', 'fr')
        expect(mockConvertSpeechToText.mock.calls[0][1].language).toBe('fr-FR')
    })

    it('returns an empty string when the audio has no speech', async () => {
        mockConvertSpeechToText.mockResolvedValue(undefined)
        await expect(speechToTextService.transcribe(chatflowWith({ openAIWhisper: { status: true } }), upload)).resolves.toBe('')
    })
})
