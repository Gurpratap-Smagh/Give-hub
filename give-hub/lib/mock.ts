/**
 * FILE: lib/mock.ts
 * PURPOSE: TEMPORARY mock data for development - REPLACE IN PRODUCTION
 * ACCESS: Import mockCampaigns/mockDonations in components and pages
 * MIGRATION NOTES:
 * - These types are now defined in lib/types.ts - import from there instead
 * - Replace all mockCampaigns imports with API calls to /api/campaigns
 * - Replace all mockDonations imports with API calls to /api/campaigns/[id]/donations
 * - This entire file should be DELETED after MongoDB integration
 * TODO:
 * - Remove type definitions (use lib/types.ts instead)
 * - Mark all import sites for replacement with real API calls
 * - Add seed data script for MongoDB development database
 */

// TEMP: Type definitions - USE lib/types.ts INSTEAD
export type Campaign = {
  id: string;
  title: string;
  goal: number;
  raised: number;
  chains: ("Ethereum" | "Solana" | "Bitcoin")[];
  description: string;
}

export type Donation = {
  campaignId: string;
  name: string;
  amount: number;
  chain: "Ethereum" | "Solana" | "Bitcoin";
  timestamp: Date;
}

export const mockCampaigns: Campaign[] = [
  {
    id: "1",
    title: "Clean Water for Rural Communities",
    goal: 50000,
    raised: 32500,
    chains: ["Ethereum", "Solana"],
    description: "Providing access to clean, safe drinking water for remote villages in developing countries. Our team will install solar-powered water purification systems that can serve entire communities. Each system can provide clean water for up to 500 people daily. The funds will cover equipment, transportation, installation, and training local technicians for maintenance. This project will directly impact over 2,000 people across 4 villages, giving them access to clean water for the first time. We've partnered with local organizations to ensure sustainability and community ownership of these systems."
  },
  {
    id: "2", 
    title: "Emergency Relief for Wildfire Victims",
    goal: 25000,
    raised: 18750,
    chains: ["Ethereum", "Bitcoin"],
    description: "Supporting families who have lost their homes in recent wildfires. Many families have been displaced with nowhere to go and need immediate assistance with temporary housing, food, clothing, and basic necessities. Your donations will provide direct financial support to affected families, help them find temporary accommodation, and cover emergency expenses while they work to rebuild their lives. We've identified 50 families in urgent need and are working with local shelters and community organizations to ensure aid reaches those who need it most. Every dollar goes directly to families - no administrative fees."
  },
  {
    id: "3",
    title: "Educational Technology for Underserved Schools",
    goal: 75000,
    raised: 45000,
    chains: ["Ethereum", "Solana", "Bitcoin"],
    description: "Bridging the digital divide by providing laptops, tablets, and internet access to students in underserved communities. Many students lack access to technology necessary for modern education, especially highlighted during remote learning periods. This campaign will purchase refurbished devices, set up internet connectivity, and provide digital literacy training for both students and teachers. We aim to serve 3 schools in rural areas, reaching approximately 300 students. The program includes ongoing technical support and educational software licenses. Studies show that access to technology can improve learning outcomes by up to 30% in these communities."
  },
  {
    id: "4",
    title: "Local Animal Shelter Expansion",
    goal: 40000,
    raised: 12000,
    chains: ["Ethereum", "Solana"],
    description: "Expanding our local animal shelter to accommodate more rescued animals and provide better medical care. Our current facility is at capacity and we're forced to turn away animals in need. The expansion will add 20 new kennels, a veterinary clinic, and a rehabilitation area for injured animals. This will allow us to rescue an additional 200 animals per year and provide on-site medical care instead of expensive external veterinary services. The shelter has been serving the community for 15 years and has successfully found homes for over 3,000 animals. All funds go directly to construction and medical equipment - our staff are volunteers."
  },
  {
    id: "5",
    title: "Youth Coding Bootcamp",
    goal: 30000,
    raised: 8500,
    chains: ["Ethereum", "Bitcoin"],
    description: "Free coding bootcamp for underrepresented youth aged 16-18 in our community. This intensive 12-week program will teach web development, mobile app creation, and basic cybersecurity skills. Many talented young people in our area lack access to quality tech education and career opportunities. The bootcamp includes mentorship from industry professionals, career counseling, and job placement assistance. We'll provide laptops, course materials, and even transportation assistance for students who need it. Our pilot program last year achieved a 90% completion rate with 80% of graduates finding tech internships or jobs within 6 months. This year we aim to serve 25 students."
  },
  {
    id: "6",
    title: "Community Garden Project",
    goal: 15000,
    raised: 22000,
    chains: ["Solana", "Bitcoin"],
    description: "Creating a sustainable community garden in an urban food desert. This project will transform a vacant lot into a thriving garden that provides fresh produce to local families while teaching sustainable farming practices. The garden will feature raised beds, a greenhouse for year-round growing, rainwater collection systems, and a composting area. We'll offer free gardening classes and distribute fresh vegetables to local food banks and low-income families. The project includes partnerships with local schools for educational field trips and after-school programs. Over 100 families have already signed up to participate, and local restaurants have committed to purchasing surplus produce to help fund ongoing maintenance."
  }
]

export const mockDonations: Donation[] = [
  {
    campaignId: "1",
    name: "Sarah Chen",
    amount: 250,
    chain: "Ethereum",
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
  },
  {
    campaignId: "1", 
    name: "Michael Rodriguez",
    amount: 100,
    chain: "Solana",
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000) // 5 hours ago
  },
  {
    campaignId: "1",
    name: "Anonymous",
    amount: 500,
    chain: "Ethereum", 
    timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000) // 8 hours ago
  },
  {
    campaignId: "1",
    name: "David Park",
    amount: 75,
    chain: "Solana",
    timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000) // 12 hours ago
  },
  {
    campaignId: "1",
    name: "Emma Thompson",
    amount: 300,
    chain: "Ethereum",
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day ago
  },
  {
    campaignId: "2",
    name: "Alex Johnson",
    amount: 150,
    chain: "Bitcoin",
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000) // 3 hours ago
  },
  {
    campaignId: "2",
    name: "Maria Garcia",
    amount: 200,
    chain: "Ethereum",
    timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000) // 6 hours ago
  },
  {
    campaignId: "2",
    name: "James Wilson",
    amount: 350,
    chain: "Bitcoin",
    timestamp: new Date(Date.now() - 10 * 60 * 60 * 1000) // 10 hours ago
  },
  {
    campaignId: "3",
    name: "Lisa Anderson",
    amount: 400,
    chain: "Ethereum",
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000) // 4 hours ago
  },
  {
    campaignId: "3",
    name: "Robert Kim",
    amount: 125,
    chain: "Solana",
    timestamp: new Date(Date.now() - 7 * 60 * 60 * 1000) // 7 hours ago
  },
  {
    campaignId: "4",
    name: "Jennifer Lee",
    amount: 180,
    chain: "Ethereum",
    timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000) // 1 hour ago
  },
  {
    campaignId: "5", 
    name: "Kevin Brown",
    amount: 90,
    chain: "Bitcoin",
    timestamp: new Date(Date.now() - 9 * 60 * 60 * 1000) // 9 hours ago
  }
]
