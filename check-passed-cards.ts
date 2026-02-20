import Card from './src/models/Card';

async function checkCardIds() {
  const ids = [
    'eca504de-e5fe-43e2-baff-5cf13b143ebd',
    '5b9ef804-5355-4c46-b1dc-94565aeeacfc',
    '308aac37-6b93-4488-9799-bb37d8b31081',
    '92735821-6134-42f9-bd69-a7a8cf452cd4',
    '4723ddc1-65f2-4e55-b3eb-14080330697b',
    '082ed515-e551-46ac-b973-f23cf11eba38',
    '80260ae8-9d28-4da7-b848-42d2c5951eaa',
    'c5b8760d-f1bc-43f6-ac07-9671ff133475',
    '5a8daf6c-3bb3-4204-81cd-a3839a2a9f26',
    '0f8b3ef0-eaa6-44af-b96d-f3db923ca9d6',
    '518c61f2-a935-4654-bc88-26559e9351c5',
    'e39da5ff-7444-45e0-8a32-75d368fb70dd',
    'db12562a-9fcf-43a5-8690-fe3610028ab5',
    '64f8f65e-7a2d-4236-9aa3-fc137737848e',
    '60b30866-ed24-42bc-b9c7-ab16b7337baa',
    '53fda6ba-2917-43a8-952b-9322f4efcdf4',
    '5483c69c-568e-4879-a213-46938ea00207',
    '23b0a8a2-64a1-4bf0-8aca-2439754774aa',
    '814df114-cfba-4695-9318-09ad7563750b',
    '82a7919d-0332-474e-a7a1-0725f9d13345',
    'cb8cee31-0012-4b98-a145-8a2d7ca25dca',
    '86a48311-b7ad-4e50-a6f5-ed985116e817',
    '072017d4-947b-499f-af7f-4035dfc14fd8',
    'b44aa169-a31a-466e-925d-4feb6412b61c',
    'd5a69c7b-2379-460b-a9ae-6fed4992733c',
    '1af49623-a9c4-42a7-82df-1b2f1435fedd',
    '68f9eef7-e1dc-47d8-8c76-8c75661d15a7'
  ];
  
  try {
    const cards = await Card.findAll({
      where: { id: ids },
      attributes: ['id', 'name', 'type'],
      raw: true
    }) as any[];
    
    console.log('\n📋 Cards passed to generateBalancedDeck:\n');
    
    const byType: { [key: string]: any[] } = {};
    cards.forEach((card: any) => {
      if (!byType[card.type]) byType[card.type] = [];
      byType[card.type].push(card);
    });
    
    Object.entries(byType).forEach(([type, cardsOfType]) => {
      console.log(`${type}: ${cardsOfType.length}`);
      cardsOfType.slice(0, 3).forEach((card: any) => {
        console.log(`  - ${card.name}`);
      });
      if (cardsOfType.length > 3) console.log(`  ... and ${cardsOfType.length - 3} more`);
      console.log('');
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkCardIds();
