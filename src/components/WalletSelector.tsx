"use client";

import { useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Wallet, ExternalLink } from "lucide-react";

interface WalletSelectorProps {
    children?: React.ReactNode;
}

export function WalletSelector({ children }: WalletSelectorProps) {
    const [open, setOpen] = useState(false);
    const { wallets, connect } = useWallet();

    // Filter out unwanted wallets, remove duplicates, and sort with Nightly first
    const availableWallets = wallets
        .filter((wallet) => {
            const name = wallet.name.toLowerCase();
            return !name.includes("petra") && 
                   !name.includes("google") && 
                   !name.includes("apple");
        })
        .filter((wallet, index, self) => {
            return index === self.findIndex((w) => w.name === wallet.name);
        })
        .sort((a, b) => {
            if (a.name.toLowerCase().includes("nightly")) return -1;
            if (b.name.toLowerCase().includes("nightly")) return 1;
            return 0;
        });

    const handleConnect = async (walletName: string) => {
        try {
            await connect(walletName);
            setOpen(false);
        } catch (error) {
            console.error("Failed to connect wallet:", error);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {children || (
                    <Button>
                        <Wallet className="w-4 h-4 mr-2" />
                        Connect Wallet
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Wallet className="w-5 h-5 text-primary" />
                        Connect Wallet
                    </DialogTitle>
                    <DialogDescription>
                        Choose a wallet to connect to Movement Network
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-2 mt-4">
                    {availableWallets.length === 0 ? (
                        <div className="text-center py-6">
                            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                                <Wallet className="w-6 h-6 text-muted-foreground" />
                            </div>
                            <p className="text-sm text-muted-foreground mb-4">
                                No compatible wallets detected.
                            </p>
                            <a
                                href="https://nightly.app/download"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <Button variant="outline" className="gap-2">
                                    <ExternalLink className="w-4 h-4" />
                                    Install Nightly Wallet
                                </Button>
                            </a>
                        </div>
                    ) : (
                        availableWallets.map((wallet) => (
                            <button
                                key={wallet.name}
                                onClick={() => handleConnect(wallet.name)}
                                className="w-full flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent hover:border-primary/50 transition-colors"
                            >
                                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                    {wallet.icon ? (
                                        <img
                                            src={wallet.icon}
                                            alt={wallet.name}
                                            className="w-6 h-6 object-contain"
                                        />
                                    ) : (
                                        <Wallet className="w-5 h-5 text-muted-foreground" />
                                    )}
                                </div>
                                <span className="font-medium">{wallet.name}</span>
                            </button>
                        ))
                    )}
                </div>
                <p className="text-xs text-muted-foreground text-center mt-4">
                    We recommend Nightly for the best Movement Network experience.
                </p>
            </DialogContent>
        </Dialog>
    );
}
