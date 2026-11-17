import express from 'express'
import speechToTextController from '../../controllers/speech-to-text'

const router = express.Router()

// Transcribe an audio file with the speech to text provider configured on the chatflow
router.post('/:id', speechToTextController.transcribe)

export default router
