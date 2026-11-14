'use client';

import { HandHeartIcon, HeartPulseIcon, PlusIcon, UsersIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs';
import { canRecordDonation, tabFromUrl, type BloodTab } from '@/lib/blood';
import { useProfile } from '../../../_components/require-session';
import { BloodRequestDialog } from './blood-request-dialog';
import { DonorsTab } from './donors-tab';
import { MyDonationsTab } from './my-donations-tab';
import { RecordDonationDialog } from './record-donation-dialog';
import { RequestsTab } from './requests-tab';
import { useUrlParams } from './use-url-params';

/**
 * /dashboard/blood (PRD FR-BLOOD; DECISIONS D41): one hub, three tabs. Requests and Donors are
 * for everyone; My donations for every role but super_admin, who doesn't donate (FR-BLOOD-001).
 * The header holds the one `default` action of the open tab.
 */
export function BloodHubView() {
  const profile = useProfile();
  const donates = canRecordDonation(profile.role);
  const { search, navigate } = useUrlParams();
  const tab = tabFromUrl(search, donates);
  const [dialog, setDialog] = useState<'request' | 'donation' | null>(null);

  return (
    <div className="container-wide flex flex-col gap-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-display-sm">Blood donation</h1>
          <p className="text-sm text-fg-secondary">
            Ask for blood, answer a request, or find a donor. Phone numbers are shared only with
            signed-in members.
          </p>
        </div>
        {tab === 'requests' ? (
          <Button onClick={() => setDialog('request')}>
            <PlusIcon data-icon="inline-start" />
            New blood request
          </Button>
        ) : tab === 'donations' ? (
          <Button onClick={() => setDialog('donation')}>
            <PlusIcon data-icon="inline-start" />
            Record donation
          </Button>
        ) : null}
      </header>

      <Tabs
        value={tab}
        onValueChange={(value) =>
          navigate({ tab: value === 'requests' ? undefined : (value as BloodTab) })
        }
      >
        <TabsList aria-label="Blood sections">
          <TabsTab value="requests">
            <HeartPulseIcon aria-hidden="true" />
            Requests
          </TabsTab>
          <TabsTab value="donors">
            <UsersIcon aria-hidden="true" />
            Donors
          </TabsTab>
          {donates ? (
            <TabsTab value="donations">
              <HandHeartIcon aria-hidden="true" />
              My donations
            </TabsTab>
          ) : null}
        </TabsList>
        <TabsPanel value="requests">
          <RequestsTab search={search} navigate={navigate} />
        </TabsPanel>
        <TabsPanel value="donors">
          <DonorsTab search={search} navigate={navigate} />
        </TabsPanel>
        {donates ? (
          <TabsPanel value="donations">
            <MyDonationsTab
              search={search}
              navigate={navigate}
              onRecord={() => setDialog('donation')}
            />
          </TabsPanel>
        ) : null}
      </Tabs>

      {dialog === 'request' ? <BloodRequestDialog onClose={() => setDialog(null)} /> : null}
      {dialog === 'donation' ? <RecordDonationDialog onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
