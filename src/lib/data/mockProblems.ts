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
  definition: {
    functional_requirements: string[];
    non_functional_requirements: string[];
    assumptions: string[];
    estimated_usage: { label: string; value: string }[];
    example?: { input: string; output: string };
  };
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
    definition: {
      example: {
        input: 'https://www.example.com/very/long/url/path',
        output: 'https://short.ly/abc123',
      },
      functional_requirements: [
        'Shorten long URLs into short, unique identifiers',
        'Redirect users to original URLs when they visit the short URL',
        'Allow custom aliases (optional)',
        'Set expiration time for URLs',
        'Provide basic analytics (click count, geographic data)',
      ],
      non_functional_requirements: [
        'High availability (99.9%)',
        'Low latency for redirects (<100ms)',
        'Scalable to handle millions of URLs',
        'Read-heavy system (100:1 read to write ratio)',
      ],
      assumptions: [
        'URL shortening service is read-heavy',
        'Users can create custom aliases',
        'Analytics data is important',
        "URLs don't expire by default",
      ],
      estimated_usage: [
        { label: '100 million URLs shortened per month', value: '' },
        { label: '10 billion redirections per month', value: '' },
        { label: 'Read to write ratio', value: '100:1' },
        { label: 'Peak QPS', value: '4000' },
      ],
    },
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
    definition: {
      functional_requirements: [
        'Users can post tweets (280 char limit)',
        'Users can follow/unfollow other users',
        'Display home feed with tweets from followed users',
        'Support likes, retweets, and replies',
      ],
      non_functional_requirements: [
        'Sub-second feed generation',
        'Eventually consistent (within seconds)',
        'Handle celebrity users with millions of followers',
      ],
      assumptions: [
        'Average user has 200 followers',
        'Celebrity users can have 50M+ followers',
        'Users check feed 5-10 times per day',
      ],
      estimated_usage: [
        { label: '500 million daily active users', value: '' },
        { label: '500 million tweets per day', value: '' },
        { label: 'Average timeline fetch', value: '50 tweets' },
      ],
    },
    is_premium_only: false,
  },
  'optimize-user-orders': {
    id: 3,
    slug: 'optimize-user-orders',
    title: '3. Optimize User Orders System',
    difficulty: 'medium',
    topic: 'System Design',
    description:
      'Improve the performance of an existing e-commerce ordering system to handle flash sale traffic spikes.',
    definition: {
      functional_requirements: [
        'Users can place orders successfully during high traffic',
        'Real-time order status updates',
        'Inventory management consistency',
        'Support for millions of active users',
      ],
      non_functional_requirements: [
        'Availability: 99.99%',
        'Scalability: Handle 10x normal load',
        'Consistency: Strong consistency for inventory',
      ],
      assumptions: [
        'Database is the current bottleneck',
        'Read:Write ratio is 50:50 during sales',
      ],
      estimated_usage: [
        { label: 'Normal QPS', value: '1000' },
        { label: 'Flash Sale Peak QPS', value: '50,000' },
      ],
    },
    is_premium_only: false,
  },
};

export function getProblemBySlug(slug: string): SystemDesignProblem | null {
  // Try exact slug match
  if (MOCK_PROBLEMS[slug]) {
    return MOCK_PROBLEMS[slug];
  }

  // Try parsing as ID
  const id = parseInt(slug);
  if (!isNaN(id)) {
    return Object.values(MOCK_PROBLEMS).find((p) => p.id === id) || null;
  }

  return null;
}
