import { OSMData, buildGraph } from "../preprocess/index.js";
import { serialize, GraphAccessor, deserialize } from "../fileformat/index.js";
import { makeByteReadableStreamFromNodeReadable } from 'node-readable-to-web-readable-stream';
import { createReadStream } from "fs";
import { writeFile } from "fs/promises";
import { Engine } from "../engine/index.js";
import { toString } from "../warnings.js";
import * as Preprocessors from "./osm-processors/index.js"

(async() => {
    //await init()
    console.time("Deserialize")
    const readStream = createReadStream("./local/test.bin")
    const webReadable = makeByteReadableStreamFromNodeReadable(readStream)
    const readback = await deserialize(webReadable.getReader({mode: "byob"}))
    const accessor = new GraphAccessor(readback)
    console.timeEnd("Deserialize")
    const engine = new Engine(accessor)
    const start = [12.56142306993516, 55.69643175811509] as const
    const end = [10.575104872599457, 57.72199432253997] as const
    console.time("Route")
    const from = engine.snapToNode(...start, 1)
    const to = engine.snapToNode(...end, 1)
    if(from === undefined || to === undefined) { return }
    const path = engine.getPath(from, to)
    const geometry = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {},
            "geometry": {
              "coordinates": engine.generateGeometry(path ?? null),
              "type": "LineString"
            }
          }]
        }
    await writeFile("./route.json", JSON.stringify(geometry), {encoding: "utf-8"})
    console.timeEnd("Route")
})()

async function init() {
    console.time("Data")
    const data = new OSMData({
        warning(warn) {
            console.warn(toString(warn))
        },
        filter: Preprocessors.filter
    })
    const interval = globalThis.setInterval(() => {
        console.log(`nodes: ${data.nodes.size}, ways: ${data.ways.size}`)
    }, 2000)
    await data.read("./local/extract.osm.pbf")
    globalThis.clearInterval(interval)
    console.timeEnd("Data")
    console.time("Preprocess")
    data.processNodes(Preprocessors.processNode)
    data.processWays(Preprocessors.processWay)
    console.timeEnd("Preprocess")
    console.time("Graph")
    const graph = buildGraph(data, Preprocessors.processTurn)
    console.timeEnd("Graph")
    console.time("Serialize")
    const serialized = await serialize(graph)
    console.timeEnd("Serialize")
    await writeFile("./local/test.bin", serialized.out)
}