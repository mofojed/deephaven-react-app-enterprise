import { useEffect } from "react";

const API_URL = import.meta.env.VITE_DEEPHAVEN_API_URL ?? "";

export function DynamicApp() {
  useEffect(() => {
    async function importApi() {
      const api = await import(`${API_URL}/irisapi.nocache.js`);
      console.log("Loaded API:", api);
    }
    importApi();
  }, []);
  return <div>Hello</div>;
}

export default DynamicApp;
