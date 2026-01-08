# Example Deephaven Enterprise React Application - JSAPI "redesign" example

This project is an example React application that demonstrates the kind of Enterprise JS API pattern that I would much prefer to see going forward. Specifically, there are a couple of key features:

- The API is specified in the package.json, and installed via npm rather than in the index.html. This is more in line with modern web development practices.
- The Core API is transparently handled under the covers, so the developer doesn't need to worry about explicitly loading API from workers, etc.
-

There are obviously still a lot of details to work out (such as how/when plugins should be loaded/work), but this is a start.

Check out the [jsapi](./src/jsapi/) folder for more details/comments.

## Quick Start

You need to set the ENV variables defined in [.env](./.env). Change them in `.env`, or you can override them with a local `.env.local` file which is ignored by git. After those are set, simply run:

```
npm install
npm start
```

Your development server will start up. It defaults to 5173, and for this demo you need to specify the query name/table name. Easiest to just go to http://localhost:5173/?queryName=WebClientData2&tableName=workspaceData to open the workspace data table.
