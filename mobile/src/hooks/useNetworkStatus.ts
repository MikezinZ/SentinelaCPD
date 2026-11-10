import { useNetInfo } from "@react-native-community/netinfo";
export function useNetworkStatus(): boolean {
  const network = useNetInfo();
  return network.isConnected !== false && network.isInternetReachable !== false;
}
