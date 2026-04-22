# WB Votes - West Bengal Election Candidate Database

A comprehensive web platform for exploring West Bengal election candidates, constituencies, and electoral data. Built with Next.js, featuring interactive candidate profiles, constituency insights, and comparative analysis tools.

## Features

- **Candidate Search & Profiles**: Browse detailed candidate information including background, occupation, party affiliation, and funding data
- **Constituency Explorer**: View constituency-level insights and key candidates running in each area
- **Candidate Comparison**: Compare multiple candidates side-by-side
- **Election News**: Aggregated news and updates about the election
- **Interactive Quiz**: Test your knowledge about candidates and constituencies
- **Party Funding Analysis**: Track and visualize political party funding
- **Electoral Map**: Visual representation of West Bengal assembly constituencies
- **Multi-language Support**: Support for multiple languages

## Tech Stack

- **Frontend**: Next.js 14+, React, TypeScript, Tailwind CSS
- **Styling**: Tailwind CSS with custom configuration
- **Maps**: Custom SVG-based electoral map
- **API**: REST API endpoints for candidates, constituencies, insights, and news
- **Database**: SQL schema (PostgreSQL compatible)

## Project Structure

```
├── src/
│   ├── app/                    # Next.js app directory
│   │   ├── api/               # API routes
│   │   ├── candidate/         # Candidate detail page
│   │   ├── candidates/        # Candidates listing
│   │   ├── compare/           # Comparison tool
│   │   ├── constituency/      # Constituency details
│   │   ├── quiz/              # Quiz page
│   │   ├── results/           # Election results
│   │   └── methodology/       # Methodology page
│   ├── components/            # Reusable React components
│   ├── data/                  # Static candidate and constituency data
│   ├── hooks/                 # Custom React hooks
│   ├── lib/                   # Utility functions and helpers
│   ├── types/                 # TypeScript type definitions
│   └── i18n/                  # Internationalization
├── database/                  # Database schema
├── scripts/                   # Data scraping and processing scripts
├── public/                    # Static assets
└── tailwind.config.ts         # Tailwind configuration
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/hoxuanji/wb-votes.git
cd wb-votes
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.local.example .env.local
```

4. Start the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Development

### Build for production:
```bash
npm run build
npm start
```

### Run scripts:
- Data scraping: `node scripts/scraper/myneta.ts`
- Data enrichment: `node scripts/scraper/enrich-occupation.js`
- Fix districts: `node scripts/fix-districts.js`

## API Endpoints

- `GET /api/candidates` - List all candidates
- `GET /api/candidates/[id]` - Get candidate details
- `GET /api/constituencies` - List constituencies
- `GET /api/insights/[id]` - Get constituency insights
- `GET /api/news` - Get election news
- `GET /api/quiz/questions` - Get quiz questions

## Deployment

### Deploy to Vercel (Recommended)

1. Push your code to GitHub
2. Go to [vercel.com/import](https://vercel.com/import)
3. Connect your repository
4. Vercel will auto-detect Next.js configuration
5. Click "Deploy"

Your site will be live at `<project-name>.vercel.app`

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

## Data Sources

- Candidate data from MyNeta and election commission
- News aggregation from various electoral news sources
- Party funding data from election commission filings

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.

## License

MIT License - feel free to use this project for your own purposes.

## Contact

For questions or suggestions, open an issue on the GitHub repository.

---

**Last Updated**: April 2026
