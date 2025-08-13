/**
 * MOCK AI Service
 * 
 * In a real application, this would be replaced with a call to a real AI service
 * like OpenAI, Hugging Face, or a self-hosted model.
 */

// A simple mock function to simulate generating a campaign description
export async function generateCampaignDescription(prompt: string): Promise<string> {
  console.log(`[AI Mock] Generating description for prompt: "${prompt}"`);

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  const enhancedPrompt = `Create a compelling, inspiring, and professional-sounding campaign description based on the following user input: "${prompt}". Make it engaging and motivate people to donate.`;

  // In a real scenario, you would send `enhancedPrompt` to an AI API.
  // For now, we'll return a detailed, templated response.
  const aiResponse = `We are launching a critical mission to support **${prompt.toLowerCase()}**. Our goal is to bring tangible change and hope to communities in need. With your help, we can provide essential resources, foster sustainable growth, and create lasting impact. 

Every contribution, no matter the size, brings us one step closer to achieving our vision. Join us in making a difference. Your generosity is the spark that ignites a brighter future for countless individuals. Let's build a better world, together.`;

  console.log(`[AI Mock] Generated description.`);
  return aiResponse;
}

// A mock function to simulate getting personalized campaign recommendations
export async function getPersonalizedRecommendations(userId: string): Promise<string[]> {
  console.log(`[AI Mock] Getting recommendations for user: ${userId}`);
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800));

  // In a real app, this would involve analyzing user data and running it through a recommendation model.
  // Here, we just return a static list of campaign IDs.
  const recommendedCampaignIds = ['1', '3', '5']; // Example IDs

  console.log(`[AI Mock] Found recommendations:`, recommendedCampaignIds);
  return recommendedCampaignIds;
}
