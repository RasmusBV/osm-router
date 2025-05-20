export type RouteNode = {
    id: number
    edgeIndex: number, 
    fixedCost: number, 
    dynamicCost: number, 
    totalCost: number,
    index: number
    parent: RouteNode | null
}

export namespace RouteNode {
    export function iter(candidate: RouteNode | null | undefined, callback: (val: RouteNode, i: number) => void) {
        let current = candidate
        let k = 0
        while(current) {
            callback(current, k)
            k++
            current = current.parent
        }
    }
}


export class CandidatePool {
    map = new Map<number | null, RouteNode>()
    index = 0
    id = 0

    init() {
        this.map.clear()
        this.index = 0
        this.id++
    }

    getCandidate(edgeIndex: number | null | undefined) {
        if(edgeIndex === undefined || edgeIndex === null ) { return null }
        const candidate = this.map.get(edgeIndex)
        if(!candidate || candidate.id !== this.id) { return null }
        return candidate
    }
    push(
        edgeIndex: number, 
        fixedCost: number, 
        dynamicCost: number, 
        parent: RouteNode | null
    ) {
        const current = this.map.get(edgeIndex)
        const totalCost = fixedCost + dynamicCost
        if(
            current &&
            current.id === this.id &&
            current.totalCost <= totalCost
        ) {
            return null
        }
        const index = parent ? (parent.index + 1) : 0
        if(current && current.id !== this.id) {
            current.fixedCost = fixedCost
            current.dynamicCost = dynamicCost
            current.totalCost = totalCost
            current.parent = parent
            current.index = index
            current.id = this.id
            return current
        }
        const candidate: RouteNode = {
            edgeIndex,
            fixedCost,
            dynamicCost,
            totalCost,
            parent,
            index,
            id: this.id
        }
        this.map.set(edgeIndex, candidate)
        return candidate
    }
}