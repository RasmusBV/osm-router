# **Demo**

The demo features two examples of dynamic cost functions. One avoids the circle, and one is required to pass through it.

![Demo Showcase](./assets/demo_showcase.gif)

## **Quick Start**
First steps to run the demo is to install and compile the project
```
npm i
npx tsc
```

When the project is compiled, download an OpenStreetMap extract from for example [Geofabrik](http://download.geofabrik.de/). In this example, the extract for Paris is used.

```
wget https://download.geofabrik.de/europe/france/ile-de-france-latest.osm.pbf
```

Run the demo pre-processing step with the path to the OpenStreetMap extract on your machine.
```
npm run preprocess /path/to/ile-de-france-latest.osm.pbf
```
This may take a while and require quite a lot of memory, the npm script is set up to allow NodeJS to use 8 GB of heap memory which is enough for Paris in this example, but if you wish to explore other extracts, be aware that you may have to allocate more memory to NodeJS.

This process creates a `graph.bin` file which contains a routable graph of the OpenStreetMap extract among other things. For a deeper dive into what it contains, look up `docs/fileformat.md`.

Finally open an HTTP routing server on port 8080
```
npm run demo 8080
```

Accessing `localhost:8080` will now serve the demo.