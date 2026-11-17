import { NextFunction, Request, Response } from 'express'
import { isValidUUID } from 'flowise-components'
import { StatusCodes } from 'http-status-codes'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import chatflowsService from '../../services/chatflows'
import speechToTextService, { SPEECH_TO_TEXT_NOT_CONFIGURED } from '../../services/speech-to-text'
import { validateFlowAPIKey } from '../../utils/validateKey'

const transcribe = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { data, name, mime, language } = req.body ?? {}
        if (typeof data !== 'string' || !data || typeof name !== 'string' || !name) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, `Error: speechToTextController.transcribe - data or name not provided!`)
        }
        const workspaceId = req.user?.activeWorkspaceId
        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.UNAUTHORIZED, `Error: speechToTextController.transcribe - workspace not found!`)
        }
        const chatflowId = req.params.id
        if (!isValidUUID(chatflowId)) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Chatflow ${chatflowId} not found`)
        }
        // Scoped to the caller's workspace: a chatflow of another workspace is reported as not found
        const chatflow = await chatflowsService.getChatflowByIdForWorkspace(chatflowId, workspaceId)
        if (!(await validateFlowAPIKey(req, chatflow))) {
            throw new InternalFlowiseError(StatusCodes.UNAUTHORIZED, `Unauthorized`)
        }

        const text = await speechToTextService.transcribe(
            chatflow,
            { data, name, mime, type: 'file' },
            req.user?.activeOrganizationId,
            language
        )
        return res.json({ text })
    } catch (error) {
        if (error instanceof InternalFlowiseError && error.message === SPEECH_TO_TEXT_NOT_CONFIGURED) {
            return res.status(error.statusCode).json({
                statusCode: error.statusCode,
                success: false,
                code: SPEECH_TO_TEXT_NOT_CONFIGURED,
                message: `Chatflow ${req.params.id} has no enabled speech to text provider`
            })
        }
        next(error)
    }
}

export default {
    transcribe
}
