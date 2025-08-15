#GiveHub

A Gemini-Powered Cross-Chain Fundraising Platform
🚀 Project Description
GiveHub is a decentralized fundraising platform built to simplify the donation process. It leverages ZetaChain's Universal Smart Contracts to allow campaign organizers to accept donations from multiple blockchains (Ethereum and Solana) through a single contract. The platform features an AI-powered chat assistant, built with Google Gemini, that enables donors to make contributions using natural language commands. This hybrid approach offers both an innovative conversational user experience and a reliable traditional interface.

✨ Key Features
Cross-Chain Donations: Accept donations from multiple networks (Ethereum, Solana, and more) into a single smart contract on ZetaChain.

AI-Powered Donations: Use a chat assistant powered by Gemini's function calling to make donations via simple text commands.

Manual Donation Fallback: A traditional user interface is available for direct, manual donations, ensuring reliability even if the AI API is unavailable.

Unified Liquidity: All donated funds are managed within a single contract, simplifying the donation tracking and withdrawal process for campaign organizers.

🛠️ Technologies Used
Blockchain: ZetaChain (Universal EVM, Universal Smart Contracts)

Smart Contract Language: Solidity

Frontend: Next.js, React, Tailwind CSS

Wallet Integration: Wagmi (for EVM chains), Solana Wallet Adapter (for Solana)

AI: Google Gemini API

📦 Installation and Setup
Clone the repository:

Bash

git clone https://github.com/your-username/give-hub.git
cd give-hub
Install dependencies:

Bash

npm install
Set up environment variables:
Create a .env.local file in the root directory with the following variables:

Bash

NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_api_key_here
NEXT_PUBLIC_ZETACHAIN_RPC_URL=your_zeta_chain_rpc_url_here
Deploy the smart contract:
Follow the instructions in the contracts/ directory to deploy the FundraiserHub.sol contract to the ZetaChain testnet. Update the .env.local file with the deployed contract address.

➡️ How to Run
Start the development server:

Bash

npm run dev
Open your browser and navigate to http://localhost:3000.

🎬 Demo Video
[Link to your 3-5 minute demo video on Loom or YouTube]

🤝 Contribution
This project was created for the ZetaChain X Google Cloud AI Buildathon.

📄 License
MIT License

Copyright (c) [2025] [Your Name]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

# make ai smarter
# make design consistent
# mongo shift
# Smart contract