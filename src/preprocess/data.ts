import { TransformCallback, Writable } from "stream";
import { createReadStream } from "fs"
import { OSMTransform } from "osm-pbf-parser-node"
import { Info } from "../logging.js";
import * as OSM from "../types.js"
import type { Obstacle } from "./obstacles.js";
import { ProcessTurn, buildGraph } from "./graph.js";
import { buildJunctionMap } from "./junctions.js";
import { buildRestrictionMap } from "./restrictions.js";
import TypedEventEmitter from "../typedEmitter.js"
export type ElementHandler<T extends OSM.Element> = (
    element: T, 
    relations: OSM.Relation[] | undefined,
    data: OSMData
) => boolean


type OSMDataEvents = {
    warning: (warn: Info) => void,
    info: (object: Info) => void
}

export type OSMOptions = {
    filter: (element: OSM.Element) => boolean
}

export class OSMData extends TypedEventEmitter<OSMDataEvents> {    
    public obstacles = new Map<OSM.Node, Obstacle[]>()
    
    public nodes = new Map<OSM.NodeId, OSM.Node>()
    
    public ways = new Map<OSM.WayId, OSM.ProcessedWay>()
    public nodeToWayMap = new Map<OSM.NodeId, OSM.WayId[]>()
    
    public relations = new Map<OSM.RelationId, OSM.Relation>()
    public elementToRelationMap = new Map<OSM.Id, OSM.Relation[]>()

    constructor(
        public options: Partial<OSMOptions> = {}
    ) {
        super()
    }

    process<T extends OSM.Element>(type: T["type"], handler: ElementHandler<T>) {
        const map = this[`${type}s`]
        let i = 0
        const amount = map.size
        const interval = globalThis.setInterval(() => {
            this.emit("info", new Info.Progress({[type]: [i, amount]}))
        }, 2000)
        try {
            for(const element of map.values()) {
                if(!handler(element as any, this.elementToRelationMap.get(element.id), this)) {
                    map.delete(element.id as any)
                }
                i++
            }
        } catch(e) {
            throw e
        } finally {
            globalThis.clearInterval(interval)
        }
        return this
    }

    addObstacle(node: OSM.Node, obstacle: Obstacle) {
        let nodeObstacles = this.obstacles.get(node)
        if(!nodeObstacles) {
            nodeObstacles = []
            this.obstacles.set(node, nodeObstacles)
        }
        nodeObstacles.push(obstacle)
    }
    
    build(processTurn: ProcessTurn) {
        const junctions = buildJunctionMap(this)
        
        this.emit("info", new Info.Message("Built junction map"))
        const restrictions = buildRestrictionMap(this)
        this.emit("info", new Info.Message("Built restriction map"))
        return buildGraph(this, junctions, restrictions, processTurn)
    }
    
    getObstacles(way: OSM.Way, from: OSM.Node, to: OSM.Node) {
        const allNodes: OSM.Node[] = []
        let inBetween = false
        for(const nodeId of way.refs) {
            const node = this.nodes.get(nodeId)
            if(!node) {
                this.emit("warning", new Info.ErrorLike(
                    "Missing Node", 
                    { nodeId, way }
                ))
                continue 
            }
            if(node === from || node === to) {
                if(inBetween) { break }
                inBetween = true
            }
            if(inBetween) {
                allNodes.push(node)
            }
        }
        return allNodes.map((node) => this.obstacles.get(node)).filter((obstacle) => obstacle !== undefined).flat()
    }

    async read(path: string) {
        
        const interval = globalThis.setInterval(() => {
            
            this.emit("info", new Info.Progress({
                nodes: [this.nodes.size],
                ways: [this.ways.size],
                relations: [this.relations.size]
            }))
        }, 2000)
        try {
            this.emit("info", new Info.Message("First read pass"))
            await this.#readPass(path, this.#firstPass.bind(this))
            this.emit("info", new Info.Message("Second read pass"))
            await this.#readPass(path, this.#secondPass.bind(this))
        } catch(e) {
            throw e
        } finally {
            globalThis.clearInterval(interval)
        }
    }

    loadNode(element: OSM.Node) {
        this.nodes.set(element.id, element)
    }
    loadWay(element: OSM.Way) {
        const way = Object.assign(element, OSM.defaultWayInfo())
        for(const nodeId of element.refs) {
            let ways = this.nodeToWayMap.get(nodeId)
            if(!ways) {
                ways = []
                this.nodeToWayMap.set(nodeId, ways)
            }
            if(!ways.includes(way.id)) {
                ways.push(way.id)
            }
        }
        this.ways.set(element.id, way)
    }
    loadRelation(element: OSM.Relation) {
        if(element.tags?.type !== "restriction") { return }
        this.relations.set(element.id, element)
        if(!element.members || !Array.isArray(element.members)) { return }
        for(const member of element.members) {
            let relations = this.elementToRelationMap.get(member.ref)
            if(!relations) {
                relations = []
                this.elementToRelationMap.set(member.ref, relations)
            }
            relations.push(element)
        }
    }

    readElement(element: OSM.Element) {
        switch(element.type) {
            case "node": {
                this.loadNode(element)
                break
            } case "way": {
                this.loadWay(element)
                break
            } case "relation": {
                this.loadRelation(element)
                break
            }
        }
    }

    #readPass(path: string, callback: (element: OSM.Element) => (Error | void)) {
        return new Promise<void>((resolve, reject) => {
            createReadStream(path)
            .pipe(new OSMTransform({withInfo: false, withTags: true}))
            .pipe(new Writable({
                objectMode: true,
                write: (elements: any[], _: any, next: TransformCallback) => {
                    for (let element of elements) {
                        if(this.options.filter && !this.options.filter(element)) { continue }
                        const err = callback(element)
                        if(!err) { continue }
                        next(err)
                        break
                    }
                    next();
                }
            }))
            .on("finish", resolve)
            .on("error", reject)
        })
    }


    #firstPass(element: OSM.Element) {
        if(element.type !== "way") { return }
        this.loadWay(element)
    }

    #secondPass(element: OSM.Element) {
        if(element.type === "node") {
            if(!this.nodeToWayMap.has(element.id)) { return }
            this.loadNode(element)
        } else if(element.type === "relation") {
            this.loadRelation(element)
        }
    }
}