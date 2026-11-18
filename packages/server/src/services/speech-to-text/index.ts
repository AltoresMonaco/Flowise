import { convertSpeechToText, ICommonObject, IFileUpload } from 'flowise-components'
import { StatusCodes } from 'http-status-codes'
import { ChatFlow } from '../../database/entities/ChatFlow'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { getErrorMessage } from '../../errors/utils'
import { databaseEntities } from '../../utils'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'

export const SPEECH_TO_TEXT_NOT_CONFIGURED = 'speech_to_text_not_configured'

// Azure expects a locale (en-US), not an ISO 639-1 code, so the request language does not apply to it
const PROVIDERS_WITHOUT_ISO_LANGUAGE = ['azureCognitive']

const getEnabledProvider = (chatflow: ChatFlow): ICommonObject | undefined => {
    const providers: ICommonObject = chatflow.speechToText ? JSON.parse(chatflow.speechToText) : {}
    const name = Object.keys(providers).find((provider) => providers[provider]?.status)
    return name ? { ...providers[name], name } : undefined
}

/**
 * Transcribe an audio file with the speech to text provider enabled on the chatflow.
 * The audio is transcribed from memory and never written to storage.
 */
const transcribe = async (chatflow: ChatFlow, upload: IFileUpload, orgId?: string, language?: string): Promise<string> => {
    const speechToTextConfig = getEnabledProvider(chatflow)
    if (!speechToTextConfig) {
        throw new InternalFlowiseError(StatusCodes.UNPROCESSABLE_ENTITY, SPEECH_TO_TEXT_NOT_CONFIGURED)
    }
    if (language && !PROVIDERS_WITHOUT_ISO_LANGUAGE.includes(speechToTextConfig.name)) {
        speechToTextConfig.language = language
    }
    try {
        const base64 = (upload.data as string).split(',').pop() as string
        const options: ICommonObject = {
            orgId,
            chatflowid: chatflow.id,
            appDataSource: getRunningExpressApp().AppDataSource,
            databaseEntities,
            audioBuffer: Buffer.from(base64, 'base64')
        }
        const text = await convertSpeechToText({ ...upload, data: undefined }, speechToTextConfig, options)
        return text ?? ''
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: speechToTextService.transcribe - ${getErrorMessage(error)}`
        )
    }
}

export default {
    transcribe
}
