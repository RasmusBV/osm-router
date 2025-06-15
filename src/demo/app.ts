import { BiDjikstras } from "../index.js";
import * as geokdbush from "geokdbush"
import z from "zod"
import * as http from "http"
import * as fs from "fs"
import convex from "@turf/convex"
import { point, lineString, featureCollection } from "@turf/helpers"

;(async() => {
    const graphFile = process.argv[2]
    const port = process.argv[3]
    const parsedPort = port ? parseInt(port) : undefined
    if(!graphFile || !parsedPort) {
        throw new Error("Please provide a graph file path and a port")
    }
    if(isNaN(parsedPort) || parsedPort < 0x0000 || parsedPort > 0xFFFF) {
        throw new Error("Invalid port value: " + port)
    }
    const engine = await BiDjikstras.fromPath(graphFile)

    const postProcess = (edges: Set<number>) => {
        const points: [lon: number, lat: number][] = []
        let i = 0
        for(const edge of edges.values()) {
            if(i++ % 10 !== 0) { continue }
            const nodeListIndex = engine.data.accessors.edges.nodeListIndex(edge)
            const nodeIndex = engine.data.accessors.nodeList.nodeIndex(nodeListIndex)
            points.push(engine.data.nodePos(nodeIndex))
        }
        return convex(featureCollection(points.map((coords) => point(coords))))
    }

    const route = (query: Query) => {
        const fromEdges = engine.data.getNearbyEdges(...query.from, MAX_SNAP_EDGES, Infinity)
        const toEdges = engine.data.getNearbyEdges(...query.to, MAX_SNAP_EDGES, Infinity)
        if(fromEdges.length === 0 || toEdges.length === 0) {
            return null
        }
        const radius = MIN_AVOID_SIZE + query.strength * (MAX_AVOID_SIZE - MIN_AVOID_SIZE)
        const onFound = query.avoid ? 100_000_000 : 0
        const edges = new Set<number>()
        const path = engine.run(fromEdges, toEdges, {
            dynamicCostFunction: (previous, edgeIndex) => {
                edges.add(edgeIndex)
                if(previous?.dynamicCost === onFound) {
                    return onFound
                }
                let found = false
                let distance = 0
                
                engine.data.listEdgeNodes(edgeIndex, (nodeIndex) => {
                    distance = geokdbush.distance(
                        engine.data.accessors.nodes.lon(nodeIndex),
                        engine.data.accessors.nodes.lat(nodeIndex),
                        query.via[0],
                        query.via[1]
                    )
                    if(distance*1000 < radius) {
                        found = true
                        return false
                    }
                })
                if(found) {
                    return onFound
                } else if(!query.avoid) {
                    return distance*10_000
                } else {
                    return 0
                }
            }
        })
        if(!path) { return null }
        const geometry = engine.generateGeometry(path.forward, path.backward)
        return {
            geometry,
            totalLength: path.backward.totalLength + path.forward.totalLength,
            iterations: path.iterations,
            visited: postProcess(edges)
        }
    }

    http.createServer(async(req, res) => {
        try {
            switch(req.url) {
                case "/": {
                    fs.createReadStream("./static/index.html").pipe(res)
                    break
                } case "/script.js": {
                    fs.createReadStream("./static/script.js").pipe(res)
                    break
                } case "/path": {
                    let rawBody = ""
                    req.on("data", (chunk) => rawBody += chunk)
                    await new Promise((resolve) => {
                        req.on("end", resolve)
                    })
                    const body = JSON.parse(rawBody)
                    const query = searchQuerySchema.parse(body)
                    const start = process.hrtime.bigint()
                    const result = route(query)
                    const totalTime = Number(process.hrtime.bigint() - start)/10e6
                    if(!result) {
                        res.writeHead(404).end()
                        return
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify({
                        geometry: {
                            type: "FeatureCollection",
                            features: [
                                lineString(result.geometry),
                                result.visited
                            ],
                        },
                        totalTime,
                        length: result.totalLength,
                        iterations: result.iterations
                        
                    }))
                    break
                } default: {
                    res.writeHead(404).end()
                    break
                }
            }

        } catch(e) {
            console.warn(e)
            res.writeHead(500).end()
        }
    }).listen(port, () => {
        console.log(`Listening on localhost:${port}`)
    })
})()

const searchQuerySchema = z.object({
    from: z.tuple([z.number(), z.number()]),
    via: z.tuple([z.number(), z.number()]),
    to: z.tuple([z.number(), z.number()]),
    strength: z.number().min(0).max(1),
    avoid: z.boolean()
})

type Query = z.infer<typeof searchQuerySchema>

const MIN_AVOID_SIZE = 0
const MAX_AVOID_SIZE = 2000
const MAX_SNAP_EDGES = 25
