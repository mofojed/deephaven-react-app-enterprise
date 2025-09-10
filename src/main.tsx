import React from "react";
import ReactDOM from "react-dom";
import { RouterProvider, createBrowserRouter } from "react-router-dom";

// Need to import the base style sheet for proper styling
import "@deephaven/components/scss/BaseStyleSheet.scss";
// import App from "./App";
// import IFrameApp from "./IFrameApp";
import { preloadTheme, ThemeData, ThemeProvider } from "@deephaven/components";
import { DynamicApp } from "./DynamicApp";

const router = createBrowserRouter([
  {
    path: "/",
    element: <DynamicApp />,
  },
  // {
  //   path: "/iframe",
  //   element: <IFrameApp />,
  // },
]);

const customThemes: ThemeData[] = [];

// Preload any cached theme variables to avoid a flash of unstyled content
preloadTheme();

ReactDOM.render(
  <React.StrictMode>
    <ThemeProvider themes={customThemes}>
      <RouterProvider router={router} />
    </ThemeProvider>
  </React.StrictMode>,
  document.getElementById("root")
);
