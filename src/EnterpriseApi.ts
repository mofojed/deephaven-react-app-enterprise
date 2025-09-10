import { EnterpriseDhType as DheType } from "@deephaven-enterprise/jsapi-types";

/**
 *
 * @param apiUrl The base URL of the Deephaven API, e.g. http://localhost:8123/irisapi
 * @returns The imported Deephaven Enterprise API module
 */
export async function loadEnterpriseApi(apiUrl: string): Promise<DheType> {
  if (window.dh != null) {
    throw new Error(
      "window.dh is already defined. Cannot import multiple versions of the Deephaven Enterprise API."
    );
  }

  const api = await import(`${apiUrl}/irisapi.nocache.js`);
  console.log("Loaded Enterprise API:", api);
  return api as DheType;
}
