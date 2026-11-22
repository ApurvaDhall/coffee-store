-- Seed data: 15 realistic coffee products.

INSERT INTO products (
  id,
  name,
  origin,
  roast_level,
  price_cents,
  image_url,
  description,
  stock,
  created_at
)
VALUES
  (
    'prod_ethiopia_yirgacheffe',
    'Ethiopia Yirgacheffe Heirloom',
    'Ethiopia',
    'light',
    1799,
    'https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=600&q=70',
    'Floral and citrus-forward with jasmine aroma and tea-like body.',
    42,
    CURRENT_TIMESTAMP
  ),
  (
    'prod_colombia_huila',
    'Colombia Huila Supremo',
    'Colombia',
    'medium',
    1599,
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=600&q=70',
    'Balanced cup with caramel sweetness, red apple acidity, and cocoa finish.',
    58,
    CURRENT_TIMESTAMP
  ),
  (
    'prod_guatemala_antigua',
    'Guatemala Antigua',
    'Guatemala',
    'medium',
    1699,
    'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=600&q=70',
    'Chocolate and orange zest with a smooth, syrupy body.',
    37,
    CURRENT_TIMESTAMP
  ),
  (
    'prod_kenya_aa',
    'Kenya AA Kirinyaga',
    'Kenya',
    'light',
    1899,
    'https://images.unsplash.com/photo-1498804103079-a6351b050096?auto=format&fit=crop&w=600&q=70',
    'Bright blackcurrant notes with juicy acidity and clean finish.',
    31,
    CURRENT_TIMESTAMP
  ),
  (
    'prod_brazil_cerrado',
    'Brazil Cerrado Natural',
    'Brazil',
    'medium',
    1499,
    'https://images.unsplash.com/photo-1512568400610-62da28bc8a5c?auto=format&fit=crop&w=600&q=70',
    'Nutty and sweet with hazelnut, milk chocolate, and low acidity.',
    64,
    CURRENT_TIMESTAMP
  ),
  (
    'prod_sumatra_mandheling',
    'Sumatra Mandheling',
    'Indonesia',
    'dark',
    1749,
    'https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=600&q=70',
    'Earthy spice, cedar, and dark chocolate in a full-bodied cup.',
    26,
    CURRENT_TIMESTAMP
  ),
  (
    'prod_costarica_tarrazu',
    'Costa Rica Tarrazu',
    'Costa Rica',
    'medium',
    1649,
    'https://images.unsplash.com/photo-1459755486867-b55449bb39ff?auto=format&fit=crop&w=600&q=70',
    'Honeyed sweetness with stone fruit notes and crisp acidity.',
    45,
    CURRENT_TIMESTAMP
  ),
  (
    'prod_rwanda_huye',
    'Rwanda Huye Mountain',
    'Rwanda',
    'light',
    1725,
    'https://images.unsplash.com/photo-1461988091159-192b6df7054f?auto=format&fit=crop&w=600&q=70',
    'Berry-like sweetness with citrus sparkle and silky mouthfeel.',
    33,
    CURRENT_TIMESTAMP
  ),
  (
    'prod_peru_chanchamayo',
    'Peru Chanchamayo Organic',
    'Peru',
    'medium',
    1549,
    'https://images.unsplash.com/photo-1497515114629-f71d768fd07c?auto=format&fit=crop&w=600&q=70',
    'Toffee and almond flavors with soft acidity and clean finish.',
    51,
    CURRENT_TIMESTAMP
  ),
  (
    'prod_papua_sigri',
    'Papua New Guinea Sigri',
    'Papua New Guinea',
    'medium',
    1810,
    'https://images.unsplash.com/photo-1485808191679-5f86510681a2?auto=format&fit=crop&w=600&q=70',
    'Tropical fruit, cocoa nib, and lively structure.',
    24,
    CURRENT_TIMESTAMP
  ),
  (
    'prod_mexico_chiapas',
    'Mexico Chiapas Altura',
    'Mexico',
    'medium',
    1525,
    'https://images.unsplash.com/photo-1494314671902-399b18174975?auto=format&fit=crop&w=600&q=70',
    'Brown sugar sweetness with cocoa and mild citrus.',
    47,
    CURRENT_TIMESTAMP
  ),
  (
    'prod_tanzania_peaberry',
    'Tanzania Peaberry',
    'Tanzania',
    'light',
    1760,
    'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=70',
    'Winey body with blackberry notes and bright acidity.',
    29,
    CURRENT_TIMESTAMP
  ),
  (
    'prod_india_monsooned',
    'India Monsooned Malabar',
    'India',
    'dark',
    1685,
    'https://images.unsplash.com/photo-1458819714733-e5ab3d536722?auto=format&fit=crop&w=600&q=70',
    'Low-acid, creamy cup with spice, tobacco, and dark cacao.',
    34,
    CURRENT_TIMESTAMP
  ),
  (
    'prod_honduras_marcala',
    'Honduras Marcala',
    'Honduras',
    'medium',
    1575,
    'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=600&q=70',
    'Sweet citrus and praline with medium body and soft finish.',
    40,
    CURRENT_TIMESTAMP
  ),
  (
    'prod_espresso_house_blend',
    'House Espresso Blend',
    'Blend',
    'dark',
    1399,
    'https://images.unsplash.com/photo-1521302080334-4bebac276a28?auto=format&fit=crop&w=600&q=70',
    'Rich crema with notes of bittersweet chocolate and toasted sugar.',
    72,
    CURRENT_TIMESTAMP
  );
