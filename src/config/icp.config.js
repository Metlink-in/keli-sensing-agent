// ============================================================
// ICP CONFIGURATION - Ideal Customer Profile for Keli Sensing
// Edit these criteria to tune who the agents target
// ============================================================

module.exports = {
  // ---- COMPANY CRITERIA ----
  company: {
    // Robotics sub-segments to target
    segments: [
      "warehouse robotics",
      "industrial automation",
      "medical robotics",
      "agricultural robotics",
      "autonomous mobile robots",
      "collaborative robots",
      "logistics automation",
      "manufacturing automation",
      "inspection robotics",
      "construction robotics",
      "service robotics",
    ],

    // Employee count ranges (scored)
    employeeRanges: [
      { min: 1000, max: Infinity, label: "Enterprise", score: 30 },
      { min: 200, max: 999, label: "Mid-Market", score: 20 },
      { min: 50, max: 199, label: "SMB", score: 10 },
      { min: 1, max: 49, label: "Startup", score: 5 },
    ],

    // Revenue ranges (scored)
    revenueRanges: [
      { min: 100_000_000, max: Infinity, label: "$100M+", score: 25 },
      { min: 10_000_000, max: 99_999_999, label: "$10M-$100M", score: 15 },
      { min: 1_000_000, max: 9_999_999, label: "$1M-$10M", score: 8 },
      { min: 0, max: 999_999, label: "<$1M", score: 2 },
    ],

    // Geographic targets
    geographics: [
      "United States",
      "Canada",
      "Germany",
      "Japan",
      "South Korea",
      "United Kingdom",
      "Netherlands",
      "Sweden",
      "Denmark",
      "Australia",
    ],

    // Technology signals that indicate compatibility
    technologySignals: [
      "LiDAR",
      "SLAM",
      "computer vision",
      "sensor fusion",
      "ROS",
      "robot operating system",
      "autonomous navigation",
      "depth sensing",
      "3D mapping",
      "point cloud",
      "ToF sensor",
      "time-of-flight",
      "IMU",
      "MEMS sensor",
    ],

    // Disqualifying signals
    disqualifiers: [
      "toy robots",
      "educational robots",
      "hobbyist",
      "consumer electronics only",
    ],
  },

  // ---- ROLE/PERSONA TARGETS ----
  roles: {
    primary: [
      "CTO",
      "Chief Technology Officer",
      "VP of Engineering",
      "VP Engineering",
      "Head of Robotics",
      "Director of Robotics",
      "Director of Engineering",
    ],
    secondary: [
      "Robotics Engineer",
      "Senior Robotics Engineer",
      "Robotics Lead",
      "Automation Engineer",
      "Systems Integration Engineer",
      "Sensor Integration Engineer",
    ],
    tertiary: [
      "Supply Chain Director",
      "Logistics Manager",
      "Procurement Manager",
      "Head of Procurement",
      "Operations Director",
    ],
  },

  // ---- KELI SENSING VALUE PROPOSITION ----
  // Used to personalize outreach messaging
  valueProposition: {
    company: "Keli Sensing",
    website: "www.kelisensing.com",
    tagline: "Precision Sensing for the Next Generation of Robotics",
    products: [
      {
        name: "T1 Sensor",
        benefits: [
          "Ultra-low latency obstacle detection (<1ms response)",
          "High-accuracy 3D spatial mapping at industrial grade",
          "Plug-and-play ROS2 compatibility",
          "IP67 rated for harsh industrial environments",
          "50% smaller form factor vs. comparable LiDAR solutions",
          "Seamless integration with major robotics platforms",
        ],
      },
    ],
    useCases: [
      "Warehouse AMR navigation and collision avoidance",
      "Industrial robot arm spatial awareness",
      "Autonomous forklift guidance systems",
      "Medical robot precision positioning",
      "Inspection drone terrain mapping",
    ],
    differentiators: [
      "Best-in-class sensor accuracy at competitive price point",
      "Dedicated integration support team",
      "Proven in 50+ production deployments",
      "FCC and CE certified",
    ],
  },

  // ---- SCRAPING SOURCES ----
  scrapingSources: [
    {
      name: "Crunchbase Robotics",
      url: "https://www.crunchbase.com/hub/robotics-companies",
      type: "directory",
    },
    {
      name: "RoboticsBiz Directory",
      url: "https://www.roboticsbusinessreview.com/directory/",
      type: "directory",
    },
    {
      name: "IEEE Robotics Companies",
      url: "https://www.ieee.org/communities/societies/robotics/index.html",
      type: "listing",
    },
    {
      name: "Tracxn Robotics",
      url: "https://tracxn.com/d/trending-themes/startups-in-robotics",
      type: "directory",
    },
  ],
};
