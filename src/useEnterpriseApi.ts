import { useEffect, useState } from "react";
import { EnterpriseApiWrapper, loadEnterpriseApi } from "./EnterpriseApi";

export function useEnterpriseApi(apiUrl: string) {
  const [api, setApi] = useState<EnterpriseApiWrapper | null>(null);
  const [error, setError] = useState<unknown | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadApi = async () => {
      try {
        const api = await loadEnterpriseApi(apiUrl);
        if (isMounted) {
          setApi({ api });
        }
      } catch (error) {
        if (isMounted) {
          setError(error);
        }
      }
    };

    loadApi();

    return () => {
      isMounted = false;
    };
  }, [apiUrl]);

  return { api, error };
}

export default useEnterpriseApi;
