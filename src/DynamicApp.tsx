import { useCallback, useEffect, useState } from "react";
import { loadEnterpriseApi, ObjectWrapper } from "./EnterpriseApi";
import ObjectView from "./ObjectView";
import "./App.scss"; // Styles for in this app

const API_URL = import.meta.env.VITE_DEEPHAVEN_API_URL ?? "";
const USER = import.meta.env.VITE_DEEPHAVEN_USER ?? "";
const PASSWORD = import.meta.env.VITE_DEEPHAVEN_PASSWORD ?? "";

export function DynamicApp() {
  const [object, setObject] = useState<ObjectWrapper>();
  const [error, setError] = useState<string>();

  const initApp = useCallback(async () => {
    console.log("Loading Enterprise API from", API_URL);
    const enterpriseApi = await loadEnterpriseApi(API_URL);

    console.log("Creating client...");
    const client = await enterpriseApi.createClient();

    console.log("Logging in...");
    await client.login({ username: USER, token: PASSWORD, type: "password" });

    // Get the table name from the search params `queryName` and `tableName`.
    const searchParams = new URLSearchParams(window.location.search);
    const queryName = searchParams.get("queryName");
    const tableName = searchParams.get("tableName");

    if (!queryName || !tableName) {
      throw new Error(
        "No queryName or tableName provided. Please provide both as search params."
      );
    }

    console.log(`Fetching table ${tableName} from query ${queryName}...`);
    const object = await client.getObject(queryName, tableName);

    console.log("Got object:", object);
    setObject(object);
  }, []);

  useEffect(() => {
    initApp().catch((e) => setError(`${e}`));
  }, [initApp]);

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (object == null) {
    return <div>Loading...</div>;
  }

  return (
    <div className="App">
      <ObjectView object={object} />
    </div>
  );
}

export default DynamicApp;
