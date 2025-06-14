export const revalidate = 86400;

import SettingPage from '@/components/Settings'
import StatsTable from '@/components/StatTable';
import clientPromise from '@/lib/mongo';
import React from 'react'



const getBranchs = async () => {
  const client = await clientPromise;
  const db = client.db();
  return db.collection("facilities").find({}, { projection: { _id: 0 } }).toArray();
}

const getAnalytics = async () => {
  const client = await clientPromise;
  const db = client.db();
  return db.collection("branch_stats").find({}, { projection: { _id: 0 } }).toArray();
}

export default async function page() {
  const branchs = await getBranchs()
  const stats = await getAnalytics()

  return (
    <div>
      {/* <CellCount branches={branchs} /> */}
      <StatsTable branchs={branchs} data={stats} />
      <SettingPage branchs={branchs} />
    </div>
  )
}
