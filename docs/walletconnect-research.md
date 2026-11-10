# WalletConnect UI research

- The user-provided screenshot matches the legacy WalletConnect v1 QR modal style with Mobile/QR Code tabs and a wallet grid.
- WalletConnect v1 was shut down on 28 June 2023; its bridge servers were taken offline. The project must use WalletConnect v2 while reproducing the requested classic QR-and-wallet-directory experience through the current WalletConnect provider.
- Current implementation uses `@walletconnect/ethereum-provider` with `showQrModal: true`, one connection method, Base chain 8453 and optional Polygon chain 137.

Sources:
- https://walletconnect.com/blog/walletconnect-v1-0-has-now-been-shut-down
- https://docs.reown.com/advanced/walletconnectmodal/options
- https://wagmi.sh/react/api/connectors/walletConnect
