import { TransformCallback, Writable } from "stream";
import { createReadStream } from "fs"
import { OSMTransform } from "osm-pbf-parser-node"
import { WarningType, type WarningData, Warning, warning } from "../warnings.js";
import * as OSM from "../types.js"
import type { Obstacle } from "./obstacles.js";

export type ElementHandler<T extends OSM.Element> = (
    element: T, 
    relations: OSM.Relation[] | undefined,
    data: OSMData
) => boolean

export type OSMOptions = {
    filter: (element: OSM.Element) => boolean,
    warning: (warn: Warning<any>) => void
}

export class OSMData {    
    public obstacles = new Map<OSM.Node, Obstacle[]>()
    public nodes = new Map<OSM.NodeId, OSM.Node>()
    
    public ways = new Map<OSM.WayId, OSM.ProcessedWay>()
    public nodeToWayMap = new Map<OSM.NodeId, OSM.WayId[]>()
    
    public relations = new Map<OSM.Id, OSM.Relation[]>()
    public relationList: OSM.Relation[] = []

    constructor(
        public options: Partial<OSMOptions>
    ) {}

    static async from(
        path: string | string[],
        options: Partial<OSMOptions> = {}
    ) {
        const data = new OSMData(options)
        if(Array.isArray(path)) {
            await Promise.all(path.map((_path) => data.read(_path)))
        } else {
            await data.read(path)
        }
        return data
    }

    processNodes(handler: ElementHandler<OSM.Node>) {
        for(const element of this.nodes.values()) {
            if(!handler(element, this.relations.get(element.id), this)) {
                this.nodes.delete(element.id)
            }
        }
        return this
    }
    processWays(handler: ElementHandler<OSM.ProcessedWay>) {
        for(const element of this.ways.values()) {
            if(!handler(element, this.relations.get(element.id), this)) {
                this.ways.delete(element.id)
            }
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
    
    getObstacles(way: OSM.Way, from: OSM.Node, to: OSM.Node) {
        const allNodes: OSM.Node[] = []
        let inBetween = false
        for(const nodeId of way.refs) {
            const node = this.nodes.get(nodeId)
            if(!node) {
                this.warn(
                    WarningType.MissingNode, 
                    { nodeId, way }
                )
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

    warn<T extends WarningType>(type: T, data: WarningData[T]) {
        if(!this.options.warning) { return }
        this.options.warning(warning(type, data))
    }

    async read(path: string) {
        await this.#readPass(path, this.#firstPass.bind(this))
        await this.#readPass(path, this.#secondPass.bind(this))
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

    #firstPass(element: OSM.Element): void | Error {
        if(element.type !== "way") { return }
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

    #secondPass(element: OSM.Element): void | Error {
        if(element.type === "node") {
            if(!this.nodeToWayMap.has(element.id)) { return }
            this.nodes.set(element.id, element)
        } else if(element.type === "relation") {
            if(element.tags?.type !== "restriction") { return }
            this.relationList.push(element)
            if(!element.members || !Array.isArray(element.members)) { return }
            for(const member of element.members) {
                let relations = this.relations.get(member.ref)
                if(!relations) {
                    relations = []
                    this.relations.set(member.ref, relations)
                }
                relations.push(element)
            }
        }
    }
}