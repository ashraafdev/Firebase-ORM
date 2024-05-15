export interface DocType {
    docs: Array<Doc>,
    empty: boolean
}

export interface Doc {
    id: string,
    data: object
}