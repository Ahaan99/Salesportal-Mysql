// Amazon/Flipkart-scale category taxonomy: department > category > subcategories
// Seeded into public.categories by db/seed.js

module.exports = [
  {
    name: "Grocery & Gourmet", cats: {
      "Staples & Grains": ["Atta & Flours", "Rice & Rice Products", "Dals & Pulses", "Millets", "Poha & Daliya"],
      "Cooking Essentials": ["Edible Oils", "Ghee", "Masalas & Spices", "Salt & Sugar", "Vinegar & Cooking Pastes"],
      "Packaged Food": ["Ready to Eat", "Instant Noodles & Pasta", "Breakfast Cereals", "Pickles & Chutneys", "Papad & Fryums"],
      "Snacks & Beverages": ["Namkeen & Chips", "Biscuits & Cookies", "Tea", "Coffee", "Juices & Drinks", "Health Drinks"],
      "Dairy & Bakery": ["Milk & Milk Powder", "Paneer & Cheese", "Butter & Cream", "Breads & Buns", "Cakes & Rusks"],
      "Dry Fruits & Sweets": ["Almonds & Cashews", "Raisins & Dates", "Mithai", "Chocolates & Candies", "Honey & Spreads"],
    },
  },
  {
    name: "Health & Wellness", cats: {
      "Ayurveda & Herbal": ["Chyawanprash", "Herbal Juices", "Ashwagandha & Herbs", "Ayurvedic Medicines", "Honey & Amla"],
      "Vitamins & Supplements": ["Multivitamins", "Protein Supplements", "Omega & Fish Oil", "Calcium & Minerals", "Immunity Boosters"],
      "Health Devices": ["BP Monitors", "Glucometers", "Thermometers", "Weighing Scales", "Nebulizers"],
      "Fitness & Nutrition": ["Whey Protein", "Mass Gainers", "Energy Bars", "Electrolytes", "Slimming Foods"],
      "Personal Health": ["First Aid", "Pain Relief", "Cough & Cold", "Digestive Care", "Sanitizers & Masks"],
    },
  },
  {
    name: "Beauty & Personal Care", cats: {
      "Skin Care": ["Face Wash", "Moisturisers", "Face Masks", "Sunscreen", "Serums & Toners"],
      "Hair Care": ["Shampoos", "Conditioners", "Hair Oils", "Hair Colour", "Styling Tools"],
      "Makeup": ["Lipsticks", "Foundations & Concealers", "Eye Makeup", "Nail Polish", "Makeup Kits"],
      "Bath & Body": ["Soaps & Body Wash", "Body Lotions", "Deodorants", "Talcum Powders", "Hand Wash"],
      "Men's Grooming": ["Shaving Creams & Razors", "Beard Care", "Men's Face Care", "Trimmers", "Perfumes for Men"],
      "Fragrances": ["Perfumes", "Body Mists", "Attars", "Gift Sets"],
    },
  },
  {
    name: "Home & Kitchen", cats: {
      "Cookware": ["Kadhai & Woks", "Pressure Cookers", "Tawas & Pans", "Casseroles", "Idli & Dhokla Makers"],
      "Kitchen Storage": ["Containers & Jars", "Lunch Boxes", "Water Bottles", "Racks & Holders", "Spice Boxes"],
      "Kitchen Tools": ["Knives & Choppers", "Graters & Peelers", "Chakla Belan", "Strainers", "Measuring Tools"],
      "Home Decor": ["Wall Decor", "Clocks", "Photo Frames", "Artificial Plants", "Candles & Diyas"],
      "Furnishing": ["Bedsheets", "Curtains", "Cushion Covers", "Blankets & Quilts", "Carpets & Mats"],
      "Cleaning Supplies": ["Detergents", "Floor Cleaners", "Dishwash", "Brooms & Mops", "Toilet Cleaners"],
      "Dining & Serveware": ["Dinner Sets", "Glassware", "Cutlery", "Serving Bowls", "Thermoware"],
    },
  },
  {
    name: "Kitchen Appliances", cats: {
      "Small Appliances": ["Mixer Grinders", "Blenders", "Toasters", "Electric Kettles", "Sandwich Makers"],
      "Cooking Appliances": ["Induction Cooktops", "Gas Stoves", "Microwave Ovens", "Air Fryers", "Rice Cookers"],
      "Water & Beverages": ["Water Purifiers", "Coffee Makers", "Juicers", "Cold Press Juicers"],
      "Food Prep": ["Food Processors", "Choppers", "Atta Kneaders", "Wet Grinders"],
    },
  },
  {
    name: "Electronics", cats: {
      "Mobiles & Accessories": ["Smartphones", "Feature Phones", "Cases & Covers", "Chargers & Cables", "Power Banks", "Screen Guards"],
      "Audio": ["Earphones", "Bluetooth Headphones", "Soundbars", "Bluetooth Speakers", "Home Theatres"],
      "Wearables": ["Smart Watches", "Fitness Bands", "Smart Glasses"],
      "Computers": ["Laptops", "Monitors", "Keyboards & Mice", "Printers", "Storage & Pendrives", "Routers"],
      "Cameras": ["DSLR & Mirrorless", "Action Cameras", "CCTV & Security", "Tripods & Accessories"],
      "TV & Entertainment": ["Smart TVs", "Streaming Devices", "Remotes", "TV Mounts"],
    },
  },
  {
    name: "Home Appliances", cats: {
      "Large Appliances": ["Refrigerators", "Washing Machines", "Air Conditioners", "Dishwashers", "Deep Freezers"],
      "Seasonal Appliances": ["Fans", "Air Coolers", "Room Heaters", "Geysers", "Dehumidifiers"],
      "Home Utility": ["Irons", "Vacuum Cleaners", "Sewing Machines", "Inverters & Batteries", "Voltage Stabilizers"],
    },
  },
  {
    name: "Men's Fashion", cats: {
      "Topwear": ["T-Shirts", "Casual Shirts", "Formal Shirts", "Kurtas", "Sweatshirts & Hoodies", "Jackets"],
      "Bottomwear": ["Jeans", "Trousers", "Track Pants", "Shorts", "Pyjamas & Lungis"],
      "Footwear": ["Sports Shoes", "Casual Shoes", "Formal Shoes", "Sandals & Floaters", "Chappals & Slippers"],
      "Ethnic Wear": ["Kurta Sets", "Sherwanis", "Nehru Jackets", "Dhotis"],
      "Accessories": ["Belts", "Wallets", "Watches", "Sunglasses", "Caps & Hats", "Socks"],
      "Innerwear & Sleepwear": ["Vests", "Briefs & Trunks", "Thermals", "Night Suits"],
    },
  },
  {
    name: "Women's Fashion", cats: {
      "Ethnic Wear": ["Sarees", "Kurtas & Kurtis", "Salwar Suits", "Lehengas", "Dupattas", "Blouses"],
      "Western Wear": ["Tops & Tees", "Dresses", "Jeans & Jeggings", "Skirts", "Jumpsuits"],
      "Footwear": ["Flats & Bellies", "Heels", "Sports Shoes", "Sandals", "Juttis & Mojaris"],
      "Handbags & Clutches": ["Handbags", "Sling Bags", "Clutches", "Totes", "Backpacks"],
      "Jewellery": ["Earrings", "Necklaces & Sets", "Bangles & Bracelets", "Rings", "Mangalsutras", "Anklets"],
      "Lingerie & Sleepwear": ["Bras", "Panties", "Nightwear", "Shapewear", "Camisoles"],
      "Winter Wear": ["Shawls & Stoles", "Sweaters & Cardigans", "Jackets & Coats"],
    },
  },
  {
    name: "Kids & Baby", cats: {
      "Baby Care": ["Diapers & Wipes", "Baby Bath & Skin", "Baby Food", "Feeding Bottles", "Baby Health & Safety"],
      "Kids Clothing": ["Boys Clothing", "Girls Clothing", "Infant Wear", "Kids Ethnic Wear", "School Uniforms"],
      "Kids Footwear": ["School Shoes", "Casual Shoes", "Sandals & Floaters", "Booties"],
      "Toys & Games": ["Soft Toys", "Educational Toys", "Board Games", "Remote Control Toys", "Outdoor Play", "Building Blocks"],
      "School Supplies": ["School Bags", "Stationery", "Lunch Boxes & Bottles", "Art & Craft"],
    },
  },
  {
    name: "Sports & Fitness", cats: {
      "Exercise & Gym": ["Dumbbells & Weights", "Yoga Mats", "Resistance Bands", "Treadmills", "Exercise Bikes", "Gym Gloves"],
      "Team Sports": ["Cricket", "Football", "Badminton", "Volleyball", "Basketball", "Table Tennis"],
      "Outdoor & Adventure": ["Cycling", "Camping & Hiking", "Skating", "Swimming", "Fishing"],
      "Sportswear": ["Track Suits", "Sports T-Shirts", "Sports Shorts", "Swimwear", "Compression Wear"],
    },
  },
  {
    name: "Books & Stationery", cats: {
      "Books": ["Fiction", "Non-Fiction", "Academic & Competitive", "Children's Books", "Regional Language Books", "Comics"],
      "Office Supplies": ["Notebooks & Diaries", "Pens & Writing", "Files & Folders", "Calculators", "Whiteboards"],
      "Art Supplies": ["Colours & Paints", "Sketching & Drawing", "Craft Materials", "Canvas & Easels"],
    },
  },
  {
    name: "Automotive", cats: {
      "Car Accessories": ["Car Covers", "Seat Covers", "Car Mats", "Car Chargers", "Air Fresheners", "Cleaning & Care"],
      "Bike Accessories": ["Helmets", "Bike Covers", "Riding Gear", "Bike Locks", "Mobile Holders"],
      "Oils & Fluids": ["Engine Oils", "Coolants", "Brake Fluids", "Additives"],
      "Tools & Spares": ["Tyre Inflators", "Jump Starters", "Wipers", "Batteries", "Lighting"],
    },
  },
  {
    name: "Pet Supplies", cats: {
      "Dogs": ["Dog Food", "Dog Treats", "Collars & Leashes", "Dog Toys", "Dog Grooming"],
      "Cats": ["Cat Food", "Cat Litter", "Cat Toys", "Cat Grooming"],
      "Other Pets": ["Fish & Aquatics", "Birds", "Small Animals"],
    },
  },
  {
    name: "Garden & Outdoors", cats: {
      "Gardening": ["Seeds", "Plants & Saplings", "Pots & Planters", "Soil & Fertilizers", "Garden Tools", "Watering Equipment"],
      "Outdoor Living": ["Outdoor Furniture", "Swings & Hammocks", "Umbrellas & Canopies", "Solar Lights"],
    },
  },
  {
    name: "Industrial & Tools", cats: {
      "Hand Tools": ["Screwdrivers", "Hammers", "Wrenches & Spanners", "Pliers", "Tool Kits"],
      "Power Tools": ["Drills", "Grinders", "Saws", "Sanders", "Heat Guns"],
      "Electricals": ["Wires & Cables", "Switches & Sockets", "MCBs & Fuses", "Extension Boards", "LED Bulbs & Tubes"],
      "Safety & Security": ["Safety Shoes", "Gloves & Masks", "Helmets", "Locks", "Door Security"],
    },
  },
  {
    name: "Handloom & Handicrafts", cats: {
      "Handloom Textiles": ["Khadi Fabrics", "Handloom Sarees", "Ikat & Block Prints", "Woolen Weaves"],
      "Handicrafts": ["Terracotta & Pottery", "Brass & Metal Craft", "Wood Carving", "Bamboo & Cane", "Marble & Stone Craft"],
      "Traditional Art": ["Madhubani", "Warli", "Pattachitra", "Tanjore Paintings"],
    },
  },
  {
    name: "Spiritual & Pooja", cats: {
      "Pooja Essentials": ["Agarbatti & Dhoop", "Camphor & Wicks", "Pooja Oils & Ghee", "Roli, Chandan & Sindoor", "Pooja Thalis"],
      "Idols & Frames": ["God Idols", "Photo Frames", "Car Dashboard Idols"],
      "Spiritual Books & Music": ["Religious Books", "Mala & Rudraksha", "Yantras"],
    },
  },
  {
    name: "Farm & Agriculture", cats: {
      "Seeds & Crop": ["Vegetable Seeds", "Field Crop Seeds", "Organic Seeds"],
      "Crop Protection": ["Bio Pesticides", "Fungicides", "Herbicides", "Traps & Lures"],
      "Farm Equipment": ["Sprayers", "Irrigation Equipment", "Harvest Tools", "Animal Husbandry"],
      "Fertilizers & Nutrition": ["Organic Manure", "Micronutrients", "Growth Promoters"],
    },
  },
  {
    name: "Luggage & Travel", cats: {
      "Luggage": ["Trolley Bags", "Duffel Bags", "Backpacks", "Suitcases", "Travel Organizers"],
      "Travel Accessories": ["Neck Pillows", "Travel Bottles", "Luggage Tags & Locks", "Passport Holders"],
    },
  },
];
