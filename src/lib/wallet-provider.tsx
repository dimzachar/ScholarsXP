"use client"

import { ReactNode } from "react"
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react"
import { Network } from "@aptos-labs/ts-sdk"

interface WalletProviderProps {
    children: ReactNode
}

export function WalletProvider({ children }: WalletProviderProps) {
    return (
        <AptosWalletAdapterProvider
            autoConnect={true}
            dappConfig={{ network: Network.TESTNET }}
            onError={(error) => {
                // Silently ignore user rejection errors
                const errorMsg = typeof error === 'string' ? error : JSON.stringify(error);
                if (errorMsg.includes("User has rejected") || errorMsg.includes("rejected the request")) {
                    return;
                }
                console.error("Wallet error:", error);
            }}
        >
            {children}
        </AptosWalletAdapterProvider>
    )
}
