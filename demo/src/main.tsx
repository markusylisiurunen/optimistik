import "@radix-ui/themes/styles.css";

import { Theme } from "@radix-ui/themes";
import { Optimistik } from "optimistik";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { OptimistikProvider } from "./components/Provider";
import { makeServer } from "./server";

const optimistik = (() => {
  const server = makeServer();
  return new Optimistik({
    name: "demo",
    schemaVersion: "1",
    pullFn: (req) => server.pull(req),
    pullInterval: 250,
    pushFn: (req) => server.push(req),
    pushInterval: 250,
  });
})();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Theme>
      <OptimistikProvider value={optimistik}>
        <App />
      </OptimistikProvider>
    </Theme>
  </React.StrictMode>,
);
