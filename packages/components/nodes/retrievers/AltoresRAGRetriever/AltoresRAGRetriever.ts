import { BaseRetriever, type BaseRetrieverInput } from '@langchain/core/retrievers'
import { Document } from '@langchain/core/documents'
import axios from 'axios'
import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'
import { getCredentialData, getCredentialParam } from '../../../src/utils'

interface AltoresRAGRetrieverInput extends BaseRetrieverInput {
    baseURL: string
    apiKey: string
    collection: string
    topK: number
    dataClass: string
    minScore?: number
    filter?: ICommonObject
    retrievalMode?: string
}

class AltoresRAGRetriever extends BaseRetriever {
    lc_namespace = ['langchain', 'retrievers']

    baseURL: string
    apiKey: string
    collection: string
    topK: number
    dataClass: string
    minScore?: number
    filter?: ICommonObject
    retrievalMode?: string

    constructor(fields: AltoresRAGRetrieverInput) {
        super(fields)
        this.baseURL = fields.baseURL
        this.apiKey = fields.apiKey
        this.collection = fields.collection
        this.topK = fields.topK
        this.dataClass = fields.dataClass || 'synthetic'
        this.minScore = fields.minScore
        this.filter = fields.filter
        this.retrievalMode = fields.retrievalMode
    }

    async _getRelevantDocuments(query: string): Promise<Document[]> {
        const url = `${this.baseURL.replace(/\/+$/, '')}/v1/rag/search`
        const body: ICommonObject = {
            query,
            engine: 'grounded',
            collection: this.collection,
            max_results: this.topK
        }
        if (this.minScore !== undefined) body.min_score = this.minScore
        if (this.filter !== undefined) body.filter = this.filter
        if (this.retrievalMode && this.retrievalMode !== 'dense') body.retrieval_mode = this.retrievalMode

        try {
            const response = await axios.post(url, body, {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'X-Altores-Data-Class': this.dataClass
                }
            })

            const results = (response.data?.results ?? []) as ICommonObject[]
            return results.map(
                (r) =>
                    new Document({
                        pageContent: r.content ?? '',
                        metadata: {
                            score: r.score,
                            filename: r.filename,
                            page: r.page,
                            collection: r.collection,
                            chunk_id: r.chunk_id,
                            ...(r.metadata || {})
                        }
                    })
            )
        } catch (error) {
            // Surface the failure without leaking the Authorization header / API key.
            const status = axios.isAxiosError(error) ? error.response?.status : undefined
            const serverDetail = axios.isAxiosError(error)
                ? error.response?.data?.detail ?? error.response?.data?.message ?? error.response?.statusText
                : undefined
            const detail = serverDetail ? (typeof serverDetail === 'string' ? serverDetail : JSON.stringify(serverDetail)) : ''
            throw new Error(`Altores RAG search failed${status ? ` (HTTP ${status})` : ''} calling ${url}${detail ? `: ${detail}` : ''}`)
        }
    }
}

class AltoresRAGRetriever_Retrievers implements INode {
    label: string
    name: string
    version: number
    description: string
    type: string
    icon: string
    category: string
    baseClasses: string[]
    credential: INodeParams
    inputs: INodeParams[]

    constructor() {
        this.label = 'Altores RAG Retriever'
        this.name = 'altoresRAGRetriever'
        this.version = 1.0
        this.type = 'AltoresRAGRetriever'
        this.icon = 'altoresrag.svg'
        this.category = 'Retrievers'
        this.description = 'Retrieve grounded chunks from the Altores IAaaS sovereign RAG'
        this.baseClasses = [this.type, 'BaseRetriever']
        this.credential = {
            label: 'Altores IAaaS API',
            name: 'credential',
            type: 'credential',
            credentialNames: ['altoresIAaaSApi']
        }
        this.inputs = [
            {
                label: 'Collection',
                name: 'collection',
                type: 'string',
                description: 'RAG collection to search within'
            },
            {
                label: 'Query',
                name: 'query',
                type: 'string',
                description: 'Query to retrieve documents from retriever. If not specified, user question will be used',
                optional: true,
                acceptVariable: true
            },
            {
                label: 'Top K',
                name: 'topK',
                type: 'number',
                description: 'Number of chunks to retrieve',
                default: 5,
                optional: true,
                additionalParams: true
            },
            {
                label: 'Minimum Score',
                name: 'minScore',
                type: 'number',
                description: 'Similarity threshold between 0 and 1. Chunks below this score are discarded',
                optional: true,
                additionalParams: true
            },
            {
                label: 'Data Class',
                name: 'dataClass',
                type: 'string',
                description: 'Sent as the X-Altores-Data-Class header, required by the grounded engine',
                default: 'synthetic',
                optional: true,
                additionalParams: true
            },
            {
                label: 'Filter',
                name: 'filter',
                type: 'string',
                description: 'JSON metadata filter forwarded to the RAG search',
                optional: true,
                additionalParams: true
            },
            {
                label: 'Retrieval Mode',
                name: 'retrievalMode',
                type: 'options',
                options: [
                    { label: 'Dense (semantic)', name: 'dense' },
                    { label: 'Hybrid (BM25 + dense)', name: 'hybrid' }
                ],
                default: 'dense',
                optional: true,
                additionalParams: true,
                description: 'dense = vector only; hybrid = BM25 lexical + dense fused server-side (RRF)'
            }
        ]
    }

    async init(nodeData: INodeData, input: string, options: ICommonObject): Promise<any> {
        const collection = nodeData.inputs?.collection as string
        const topKInput = nodeData.inputs?.topK
        const minScoreInput = nodeData.inputs?.minScore
        const dataClass = (nodeData.inputs?.dataClass as string) || 'synthetic'
        const filterStr = nodeData.inputs?.filter as string
        const retrievalMode = nodeData.inputs?.retrievalMode as string

        const topK = topKInput !== undefined && topKInput !== '' ? Number(topKInput) : 5
        const parsedMinScore = minScoreInput !== undefined && minScoreInput !== '' ? parseFloat(minScoreInput as string) : undefined
        const minScore = parsedMinScore !== undefined && !isNaN(parsedMinScore) ? parsedMinScore : undefined
        const filter = filterStr ? JSON.parse(filterStr) : undefined

        const credentialData = await getCredentialData(nodeData.credential ?? '', options)
        const baseURL = getCredentialParam('baseUrl', credentialData, nodeData)
        const apiKey = getCredentialParam('apiKey', credentialData, nodeData)

        if (!baseURL) throw new Error('Altores IAaaS base URL is not set on the credential')
        if (!apiKey) throw new Error('Altores IAaaS API key is not set on the credential')

        const retriever = new AltoresRAGRetriever({
            baseURL,
            apiKey,
            collection,
            topK,
            dataClass,
            minScore,
            filter,
            retrievalMode
        })

        return retriever
    }
}

module.exports = { nodeClass: AltoresRAGRetriever_Retrievers }
