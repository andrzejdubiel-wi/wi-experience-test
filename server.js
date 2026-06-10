const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xhtml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
};

// Mock profiles for demo/offline use
const DEMO_PROFILES = {
  motorparts_pro: {
    profile: {
      username: 'motorparts_pro',
      sellerName: 'Motor Parts Pro',
      feedbackScore: 4821,
      positivePct: 99.2,
      memberSince: 'Jan-2014',
      location: 'Birmingham, United Kingdom',
      description: 'Leading supplier of genuine OEM & aftermarket vehicle parts. Same-day dispatch before 3pm.',
      businessType: 'Power Seller / Business',
      profileUrl: 'https://www.ebay.com/usr/motorparts_pro',
      isDemo: true,
    },
    listings: {
      totalListings: 12840,
      shipsWorldwide: false,
      domesticOnly: 12840,
      sponsoredCount: 4,
      sponsoredPct: 3,
      topCategories: [
        { name: 'Vehicle Parts & Accessories', count: 7200, pct: 56 },
        { name: 'Motorcycle Parts', count: 3200, pct: 25 },
        { name: 'Car Accessories', count: 1500, pct: 12 },
        { name: 'Tools & Workshop', count: 940, pct: 7 },
      ],
    },
  },
  fashionhub_uk: {
    profile: {
      username: 'fashionhub_uk',
      sellerName: 'Fashion Hub UK',
      feedbackScore: 2156,
      positivePct: 98.7,
      memberSince: 'Mar-2017',
      location: 'London, United Kingdom',
      description: 'Contemporary fashion for every occasion. Free returns on all orders.',
      businessType: 'Power Seller / Business',
      profileUrl: 'https://www.ebay.com/usr/fashionhub_uk',
      isDemo: true,
    },
    listings: {
      totalListings: 3420,
      shipsWorldwide: false,
      domesticOnly: 3420,
      sponsoredCount: 12,
      sponsoredPct: 8,
      topCategories: [
        { name: 'Women\'s Clothing', count: 1500, pct: 44 },
        { name: 'Men\'s Clothing', count: 900, pct: 26 },
        { name: 'Shoes', count: 600, pct: 18 },
        { name: 'Accessories', count: 420, pct: 12 },
      ],
    },
  },
  techdeal_store: {
    profile: {
      username: 'techdeal_store',
      sellerName: 'TechDeal Store',
      feedbackScore: 8932,
      positivePct: 97.4,
      memberSince: 'Sep-2011',
      location: 'Manchester, United Kingdom',
      description: 'Best prices on electronics, gadgets and accessories. Certified refurbished items available.',
      businessType: 'Power Seller / Business',
      profileUrl: 'https://www.ebay.com/usr/techdeal_store',
      isDemo: true,
    },
    listings: {
      totalListings: 6200,
      shipsWorldwide: true,
      domesticOnly: 0,
      sponsoredCount: 60,
      sponsoredPct: 14,
      topCategories: [
        { name: 'Mobile Phones', count: 2000, pct: 32 },
        { name: 'Laptops & Computers', count: 1800, pct: 29 },
        { name: 'Cameras', count: 1200, pct: 19 },
        { name: 'Audio & Headphones', count: 1200, pct: 19 },
      ],
    },
  },
};

function loadEstimatorData() {
  const csv = fs.readFileSync(path.join(__dirname, 'sales_estimator.csv'), 'utf8');
  return parse(csv, { columns: true, skip_empty_lines: true });
}

async function fetchSellerProfile(username) {
  const url = `https://www.ebay.com/usr/${encodeURIComponent(username)}`;
  const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
  const $ = cheerio.load(res.data);

  const feedbackScore = parseInt(
    ($('.str-about-card__score, .mbg-l').first().text().trim() || '0').replace(/,/g, ''),
    10
  ) || 0;
  const positivePct = parseFloat(
    ($('.str-about-card__feedback-percentage, .mbg-feedback').first().text().replace('%', '').trim()) || '0'
  ) || null;
  const memberSince = $('.str-about-card__member-date, .mbg-lnk').first().text().trim();
  const location = $('.str-about-card__location, [itemprop=address]').first().text().trim();
  const description = $('.str-about-card__description, .mbg-description').first().text().trim();
  const sellerName = $('h1').first().text().trim();
  const businessType = feedbackScore > 1000 ? 'Power Seller / Business' : feedbackScore > 100 ? 'Established Seller' : 'Individual Seller';

  return { username, sellerName, feedbackScore, positivePct, memberSince, location, description, businessType, profileUrl: url };
}

async function fetchSellerListings(username) {
  const url = `https://www.ebay.com/sch/i.html?_ssn=${encodeURIComponent(username)}&_pgn=1&_ipg=60`;
  const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
  const $ = cheerio.load(res.data);

  const items = [];
  $('.s-item').each((_, el) => {
    const title = $(el).find('.s-item__title').text().trim();
    const price = $(el).find('.s-item__price').text().trim();
    const shipping = $(el).find('.s-item__shipping, .s-item__freeXDays').text().trim();
    const isSponsored = $(el).find('.s-item__title-tag, .LIGHT_HIGHLIGHT').text().toLowerCase().includes('sponsored');
    const category = $(el).find('.s-item__subtitle').text().trim();
    if (title && title !== 'Shop on eBay') {
      items.push({ title, price, shipping, isSponsored, category });
    }
  });

  const totalText = $('.srp-controls__count-heading').text().trim();
  const totalMatch = totalText.match(/([\d,]+)\+?\s*(results?|items?)/i);
  const totalListings = totalMatch ? parseInt(totalMatch[1].replace(/,/g, ''), 10) : items.length;

  const shipsWorldwide = items.some(
    i => i.shipping.toLowerCase().includes('worldwide') || i.shipping.toLowerCase().includes('international')
  );
  const sponsoredCount = items.filter(i => i.isSponsored).length;
  const sponsoredPct = items.length > 0 ? Math.round((sponsoredCount / items.length) * 100) : 0;

  const categoryCounts = {};
  items.forEach(item => {
    if (item.category) {
      const cat = item.category.split(' > ')[0].trim();
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
  });
  const topCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count, pct: Math.round((count / items.length) * 100) }));

  return { items: items.slice(0, 10), totalListings, shipsWorldwide, sponsoredCount, sponsoredPct, topCategories };
}

function detectPrimaryCategory(topCategories) {
  if (!topCategories || topCategories.length === 0) return 'general';
  const top = topCategories[0].name.toLowerCase();
  if (/motor|auto|car|bike|moto|vehicle|part|engine|tyres?/.test(top)) return 'moto';
  if (/fashion|cloth|shoe|bag|jewel|apparel|wear|dress|shirt/.test(top)) return 'fashion';
  if (/electron|phone|computer|laptop|tablet|tech|camera|audio|mobile/.test(top)) return 'electronics';
  return 'general';
}

function analyzeOpportunities(profile, listings, estimatorRows) {
  const category = detectPrimaryCategory(listings.topCategories);
  const opportunities = [];

  for (const row of estimatorRows) {
    const trigger = row['Scraped Metric / Trigger'] || '';
    const feature = (row['WI Feature Match'] || '').trim();
    const impact = (row['Quantitative Impact (The Math)'] || '').trim();
    const pitch = (row['Report Output (The Pitch)'] || '').trim();
    const whyBiz = (row['Business Logic (The "Why")'] || '').trim();
    const nuance = (row['Category Nuance & Challenges'] || '').trim();

    let triggered = false;
    let severity = 'medium';
    let details = '';
    let estimatedRevenue = null;

    // Normalize trigger: collapse whitespace/newlines for matching
    const t = trigger.replace(/\s+/g, ' ').trim();

    if (/Domestic Only/i.test(t)) {
      if (!listings.shipsWorldwide) {
        triggered = true;
        severity = 'high';
        details = `Seller ships domestically only — ${listings.totalListings.toLocaleString()} listings have zero international exposure.`;
        const pct = category === 'moto' ? '14%' : category === 'fashion' ? '14%' : '13%';
        estimatedRevenue = `+${pct} active sales uplift`;
      }
    } else if (/Sponsored Item Tags/i.test(t) || /Low.*No.*PLS/i.test(t)) {
      if (listings.sponsoredPct < 20) {
        triggered = true;
        severity = listings.sponsoredPct < 5 ? 'high' : 'medium';
        details = `Only ${listings.sponsoredPct}% of visible listings are Promoted. Competitors are paying for top-of-search placement.`;
        const uprate = category === 'moto' ? '+25%' : category === 'electronics' ? '+18%' : '+10–15%';
        estimatedRevenue = `${uprate} increase in active sales`;
      }
    } else if (/Ships Worldwide/i.test(t) && /Shipping to EU/i.test(t)) {
      if (listings.shipsWorldwide) {
        triggered = true;
        severity = 'high';
        details = 'Ships internationally — EU GPSR compliance is mandatory. Non-compliance risks listing takedowns and customs blocks.';
        estimatedRevenue = 'Protects 17–28% of international revenue';
      }
    } else if (/Compatibility Table/i.test(t) || /Missing Fitment/i.test(t)) {
      if (category === 'moto') {
        triggered = true;
        severity = 'high';
        details = 'Moto/parts seller — missing fitment/K-Type data makes listings invisible in search and drives costly returns.';
        estimatedRevenue = 'Reduces returns + +14% localisation uplift';
      }
    } else if (/Item Specifics/i.test(t)) {
      triggered = true;
      severity = 'medium';
      details = 'Listings likely missing MPN/OEM/Brand specifics — invisible to professional buyers searching exact part numbers.';
      estimatedRevenue = 'Recaptures high-intent B2B traffic';
    } else if (/HTML Description/i.test(t)) {
      triggered = true;
      severity = 'medium';
      details = 'Mobile optimisation gap. 60%+ of eBay traffic is mobile — unoptimised descriptions directly reduce conversion.';
      estimatedRevenue = '+2–5% Average Order Value uplift';
    } else if (/Handling Time/i.test(t)) {
      triggered = true;
      severity = 'low';
      details = 'Extended handling time removes eBay Premium badges and suppresses Best Match ranking algorithmically.';
      estimatedRevenue = 'Restores top-of-page visibility via PLS';
    }

    if (triggered) {
      opportunities.push({
        trigger: trigger.split('\n')[0].trim(),
        feature,
        severity,
        details,
        estimatedRevenue,
        pitch: pitch.replace(/€\[X\]/g, '€[calculated revenue]').replace(/\[X\]%/g, 'a significant %'),
        businessLogic: whyBiz,
        categoryNuance: nuance,
        impact,
      });
    }
  }

  const order = { high: 0, medium: 1, low: 2 };
  opportunities.sort((a, b) => order[a.severity] - order[b.severity]);

  return { category, opportunities };
}

app.get('/api/analyze/:username', async (req, res) => {
  const { username } = req.params;
  if (!username || username.length < 2) {
    return res.status(400).json({ error: 'Invalid username' });
  }

  // Check for demo profiles (case-insensitive)
  const demoKey = Object.keys(DEMO_PROFILES).find(k => k.toLowerCase() === username.toLowerCase());
  if (demoKey) {
    const demo = DEMO_PROFILES[demoKey];
    const estimatorRows = loadEstimatorData();
    const analysis = analyzeOpportunities(demo.profile, demo.listings, estimatorRows);
    return res.json({ profile: demo.profile, listings: demo.listings, analysis, isDemo: true });
  }

  // Real eBay fetch
  try {
    const [profile, listings] = await Promise.all([
      fetchSellerProfile(username),
      fetchSellerListings(username),
    ]);
    const estimatorRows = loadEstimatorData();
    const analysis = analyzeOpportunities(profile, listings, estimatorRows);
    res.json({ profile, listings, analysis });
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ error: `eBay seller "${username}" not found.` });
    }
    // Network restriction or eBay blocking — return a helpful error with demo suggestion
    console.error('Fetch error:', err.message);
    res.status(503).json({
      error: `Could not reach eBay to fetch seller data. This can happen in restricted network environments or if eBay is rate-limiting. Try one of the demo sellers: motorparts_pro, fashionhub_uk, techdeal_store`,
      canDemo: true,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
