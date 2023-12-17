import { Optimistik } from "optimistik";
import { createContext, useContext } from "react";

const optimistikProviderContext = createContext<Optimistik | null>(null);

const OptimistikProvider = optimistikProviderContext.Provider;

function useOptimistik() {
  const optimistik = useContext(optimistikProviderContext);
  if (optimistik === null) {
    throw new Error("`useOptimistik` must be used within an `OptimistikProvider`");
  }
  return optimistik;
}

export { OptimistikProvider, useOptimistik };
