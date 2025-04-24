import { OSMData, buildGraph } from "../preprocess/index.js";
import { serialize, GraphAccessor, deserialize } from "../fileformat/index.js";
import { makeByteReadableStreamFromNodeReadable } from 'node-readable-to-web-readable-stream';
import { createReadStream } from "fs";
import { writeFile } from "fs/promises";
import { Engine } from "../engine/index.js";
import { toString } from "../warnings.js";
import * as Preprocessors from "./osm-processors/index.js"
import { test } from "../preprocess/mld/index.js";

async function init() {
    const data = new OSMData({
        warning(warn) {
            console.warn(toString(warn))
        },
        filter: Preprocessors.filter
    })
    await data.read("./local/cutout.osm.pbf")
    data.processNodes(Preprocessors.processNode)
    data.processWays(Preprocessors.processWay)
    const graph = buildGraph(data, Preprocessors.processTurn)
    test(graph)
}

init()