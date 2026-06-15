import { PrismaClient, AppointmentType } from '@prisma/client';

const prisma = new PrismaClient();

const SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

const BASELINES: Record<AppointmentType, number> = {
  follow_up: 8,
  general: 15,
  new_patient: 25,
  specialist: 35,
};

async function main() {
  console.log('🌱 Seeding database...');

  // Initialize queue settings (singleton row)
  await prisma.queueSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: {
      id: SETTINGS_ID,
      currentToken: null,
      clinicName: 'Queue Cure Clinic',
    },
  });
  console.log('✅ Queue settings initialized');

  // Initialize prediction metrics for all appointment types
  const types = Object.keys(BASELINES) as AppointmentType[];

  for (const type of types) {
    await prisma.predictionMetrics.upsert({
      where: { appointmentType: type },
      update: {},
      create: {
        appointmentType: type,
        historicalAverage: BASELINES[type],
        recentAverage: BASELINES[type],
        sampleCount: 0,
      },
    });
  }
  console.log('✅ Prediction metrics initialized with baseline durations:');
  console.log('   follow_up    → 8 min');
  console.log('   general      → 15 min');
  console.log('   new_patient  → 25 min');
  console.log('   specialist   → 35 min');

  console.log('\n🎉 Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
