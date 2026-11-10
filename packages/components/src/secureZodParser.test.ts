import { SecureZodSchemaParser } from './secureZodParser'

describe('SecureZodSchemaParser', () => {
    it('keeps dots, commas, parentheses and quotes inside a description', () => {
        const schema: any = SecureZodSchemaParser.parseZodSchema(
            `z.object({ a: z.string().describe("Une phrase. Puis (une autre), avec 'apostrophe'.") })`
        )
        expect(schema.shape.a.description).toBe("Une phrase. Puis (une autre), avec 'apostrophe'.")
    })

    it('parses chained modifiers after a description-bearing array', () => {
        const schema: any = SecureZodSchemaParser.parseZodSchema(
            `z.object({ d: z.array(z.string()).describe("Liste (courte). Une ligne par point.").optional() })`
        )
        expect(schema.shape.d.isOptional()).toBe(true)
        expect(schema.shape.d.parse(undefined)).toBeUndefined()
    })

    it('parses a judge-like schema with long French descriptions', () => {
        const schema: any = SecureZodSchemaParser.parseZodSchema(`z.object({
  verifications: z.array(z.string()).describe("A remplir AVANT de choisir le score. Une ligne par affirmation : « confirmee par le passage [n] » ou « non verifiee »."),
  score: z.number().min(0).max(10).describe("Note 0-10. 9-10 correct et complet."),
  verdict: z.enum(["correct", "partiel", "faux"]).describe("Verdict final.")
})`)
        expect(Object.keys(schema.shape)).toEqual(['verifications', 'score', 'verdict'])
        expect(schema.shape.score.description).toBe('Note 0-10. 9-10 correct et complet.')
    })

    it('unescapes escaped quotes in a description', () => {
        const schema: any = SecureZodSchemaParser.parseZodSchema(`z.object({ a: z.string().describe("Dit \\"bonjour\\". Fin.") })`)
        expect(schema.shape.a.description).toBe('Dit "bonjour". Fin.')
    })

    it('never runs code passed to a modifier outside the allow-list (it is ignored, as before)', () => {
        const schema: any = SecureZodSchemaParser.parseZodSchema(`z.object({ a: z.string().refine(() => { throw new Error("ran") }) })`)
        expect(schema.shape.a.parse('x')).toBe('x')
    })

    it('still refuses anything that is not a z.* expression', () => {
        expect(() => SecureZodSchemaParser.parseZodSchema(`z.object({ a: require("fs") })`)).toThrow()
    })
})
