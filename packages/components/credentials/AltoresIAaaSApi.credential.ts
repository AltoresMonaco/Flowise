import { INodeParams, INodeCredential } from '../src/Interface'

class AltoresIAaaSApi implements INodeCredential {
    label: string
    name: string
    version: number
    description: string
    inputs: INodeParams[]

    constructor() {
        this.label = 'Altores IAaaS API'
        this.name = 'altoresIAaaSApi'
        this.version = 1.0
        this.description = 'Connect to the Altores IAaaS sovereign RAG gateway'
        this.inputs = [
            {
                label: 'Base URL',
                name: 'baseUrl',
                type: 'string',
                placeholder: 'https://iaas.altores.app'
            },
            {
                label: 'API Key',
                name: 'apiKey',
                type: 'password'
            }
        ]
    }
}

module.exports = { credClass: AltoresIAaaSApi }
