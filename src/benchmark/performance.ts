import { BiDjikstras, Djikstras, GraphAccessor } from "../index.js";
import seedrandom from "seedrandom"


;(async () => {
    const graphFile = process.argv[2]
    const graph = await GraphAccessor.fromPath(graphFile)
    const bidjikstras = new BiDjikstras(graph)
    const djikstras = new Djikstras(graph)
    const maxEdge = (bidjikstras.data.sections.edges.buffer.byteLength / bidjikstras.data.sizes.edges) - 1
    const random = seedrandom("osm-router")
    const runs = Array.from({length: 20}, (_, i) => ({
        from: Math.floor(random() * maxEdge),
        to: Math.floor(random() * maxEdge)
    }))
    const warmup = runs.slice(0, 10)
    for(const {from, to} of warmup) {
        bidjikstras.run([from], [to])
        djikstras.run([from], [to])
    }
    const bidjikstrasRoutes = time(() => {
        let iterations = 0
        const costs = runs.map(({from, to}) => {
            const route = bidjikstras.run([from], [to])
            iterations += (route?.iterations ?? 0)
            return route?.totalCost
        })
        const total = costs.reduce((acc: number, run) => acc + (run === undefined ? 0 : 1), 0)
        return { iterations, costs, total }
    })
    console.log(
        "BiDjikstra\n", 
        {
            "runs":         bidjikstrasRoutes.result.total,
            "throughput":   (bidjikstrasRoutes.result.iterations/bidjikstrasRoutes.time).toFixed(2) + " iter/ms",
            "iterations":   bidjikstrasRoutes.result.iterations,
            "time":         bidjikstrasRoutes.time.toFixed(2) + " ms"
        }
    )
    const djikstrasRoutes = time(() => {
        let iterations = 0
        let missed = 0
        const costs = runs.map(({from, to}) => {
            const route = djikstras.run([from], [to])
            if(route.route) {
                iterations += route.iterations
            }
            if(route.iterations === 0) { missed ++ }
            return route.route?.totalCost
        })
        const total = costs.reduce((acc: number, run) => acc + (run === undefined ? 0 : 1), 0)
        return { iterations, missed, costs, total }
    })
    console.log(
        "Djikstra\n", 
        {
            "runs":         djikstrasRoutes.result.total,
            "throughput":   (djikstrasRoutes.result.iterations/djikstrasRoutes.time).toFixed(2) + " iter/ms",
            "iterations":   djikstrasRoutes.result.iterations,
            "missed":       djikstrasRoutes.result.missed,
            "time":         djikstrasRoutes.time.toFixed(2) + " ms"
        }
    )
})()

function time<T>(func: () => T) {
    const start = process.hrtime.bigint()
    const result = func()
    return {
        result,
        time: Number(process.hrtime.bigint() - start) / 10e6
    }
}