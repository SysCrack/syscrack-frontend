// Mock problem data for development
// This will eventually be fetched from the backend API

export interface ProblemExample {
  input: string;
  output: string;
}

export interface ProblemRequirement {
  text: string;
  isLink?: boolean;
}

export interface EstimatedUsage {
  label: string;
  value: string;
}

export interface SystemDesignProblem {
  id: number;
  slug: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  topic: string;
  description: string;
  example: ProblemExample;
  functionalRequirements: ProblemRequirement[];
  nonfunctionalRequirements: ProblemRequirement[];
  assumptions: string[];
  estimatedUsage: EstimatedUsage[];
  is_premium_only: boolean;
}

export const MOCK_PROBLEMS: Record<string, SystemDesignProblem> = {
  'url-shortener': {
    id: 1,
    slug: 'url-shortener',
    title: '1. Design a URL Shortener',
    difficulty: 'medium',
    topic: 'System Design',
    description:
      'Design a URL shortening service similar to bit.ly that can handle millions of URLs and provide analytics.',
    example: {
      input: 'https://www.example.com/very/long/url/path',
      output: 'https://short.ly/abc123',
    },
    functionalRequirements: [
      { text: 'Shorten long URLs into short, unique identifiers' },
      { text: 'Redirect users to original URLs when they visit the short URL' },
      { text: 'Allow custom aliases', isLink: true },
      { text: 'Set expiration time for URLs' },
      { text: 'Provide basic analytics (click count, geographic data)' },
    ],
    nonfunctionalRequirements: [
      { text: 'High availability (99.9%)' },
      { text: 'Low latency for redirects (<100ms)' },
      { text: 'Scalable to handle millions of URLs' },
      { text: 'Read-heavy system (100:1 read to write ratio)' },
    ],
    assumptions: [
      'URL shortening service is read-heavy',
      'Users can create custom aliases',
      'Analytics data is important',
      "URLs don't expire by default",
    ],
    estimatedUsage: [
      { label: '100 million URLs shortened per month', value: '' },
      { label: '10 billion redirections per month', value: '' },
      { label: 'Read to write ratio', value: '100:1' },
      { label: 'Peak QPS', value: '4000' },
    ],
    is_premium_only: false,
  },
  'twitter-feed': {
    id: 2,
    slug: 'twitter-feed',
    title: '2. Design Twitter Feed',
    difficulty: 'hard',
    topic: 'System Design',
    description:
      'Design the home timeline feed for a Twitter-like social media platform that can handle millions of users.',
    example: {
      input: 'User requests their home feed',
      output: 'Sorted list of tweets from followed users',
    },
    functionalRequirements: [
      { text: 'Users can post tweets (280 char limit)' },
      { text: 'Users can follow/unfollow other users' },
      { text: 'Display home feed with tweets from followed users' },
      { text: 'Support likes, retweets, and replies' },
    ],
    nonfunctionalRequirements: [
      { text: 'Sub-second feed generation' },
      { text: 'Eventually consistent (within seconds)' },
      { text: 'Handle celebrity users with millions of followers' },
    ],
    assumptions: [
      'Average user has 200 followers',
      'Celebrity users can have 50M+ followers',
      'Users check feed 5-10 times per day',
    ],
    estimatedUsage: [
      { label: '500 million daily active users', value: '' },
      { label: '500 million tweets per day', value: '' },
      { label: 'Average timeline fetch', value: '50 tweets' },
    ],
    is_premium_only: false,
  },
};

export function getProblemBySlug(slug: string): SystemDesignProblem | null {
  return MOCK_PROBLEMS[slug] || null;
}
