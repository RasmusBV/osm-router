import { Direction, Engine } from "../index.js";
import * as geokdbush from "geokdbush"
import z from "zod"
import * as http from "http"
import * as fs from "fs"


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
    const engine = await Engine.fromPath(graphFile)

    const route = (query: Query) => {
        const fromEdges = engine.getNearbyEdges(...query.from, MAX_SNAP_DISTANCE_METERS)
        const toEdges = engine.getNearbyEdges(...query.to, MAX_SNAP_DISTANCE_METERS)
        if(fromEdges.length === 0 || toEdges.length === 0) {
            return null
        }
        const radius = MIN_AVOID_SIZE + query.strength * (MAX_AVOID_SIZE - MIN_AVOID_SIZE)
        const onFound = query.avoid ? 100_000_000 : 0
        let i = 0
        const path = engine.djikstras(fromEdges, toEdges, {
            dynamicCostFunction: (previous, edgeIndex) => {
                i++
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
                    return distance*100_000_000
                } else {
                    return 0
                }
            }
        })
        if(!path) { return null }
        return engine.generateGeometry(path)
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
                    const result = route(query)
                    if(!result) {
                        res.writeHead(404).end()
                        return
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify({
                        type: "Feature",
                        properties: {},
                        geometry: {
                            type: "LineString",
                            coordinates: result
                        }
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
        console.log(`Listening on port: ${port}`)
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
const MAX_SNAP_DISTANCE_METERS = 25
