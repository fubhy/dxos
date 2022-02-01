//
// Copyright 2020 DXOS.org
//

import React, { useState } from 'react';

import { ChevronRight as ExpandIcon, ExpandMore as CollapseIcon } from '@mui/icons-material';
import { TreeItem, TreeView } from '@mui/lab';
import { Box } from '@mui/material';

import { Party, Item } from '@dxos/client';
import { truncateString } from '@dxos/debug';
import { MessengerModel } from '@dxos/messenger-model';
import { Model } from '@dxos/model-factory';
import { ObjectModel } from '@dxos/object-model';
import { useParties, useSelection } from '@dxos/react-client';
import { JsonTreeView } from '@dxos/react-components';
import { TextModel } from '@dxos/text-model';

import { Panel, PartySelect } from '../components';

const ItemNode = ({ item, onSelect }: ItemNodeProps) => {
  const children = useSelection(item.select(selection => selection.children().items as Item<any>[]), [item]) ?? [];

  return (
    <TreeItem nodeId={item.id} label={item.type} onClick={() => onSelect(item)}>
      {children.map((child) => (
        <ItemNode key={child.id} item={child} onSelect={onSelect} />
      ))}
    </TreeItem>
  );
};

export const ItemsPanel = () => {
  const [selectedParty, setSelectedParty] = useState<Party>();
  const [selectedItem, setSelectedItem] = useState<Item<any>>();

  const parties = useParties();
  const items = useSelection(
    selectedParty?.database.select(s => s
      .filter(item => !item.parent)
      .items as Item<any>[]),
    [selectedParty]
  ) ?? [];

  return (
    <Panel controls={(
      <PartySelect
        parties={parties}
        selected={selectedParty}
        onChange={setSelectedParty}
      />
    )}>
      <Box display='flex'>
        <TreeView
          defaultCollapseIcon={<CollapseIcon />}
          defaultExpandIcon={<ExpandIcon />}
          sx={{
            flex: 1,
            maxWidth: 300,
            overflowY: 'auto'
          }}
        >
          {items.map(item => (
            <ItemNode
              key={item.id}
              item={item}
              onSelect={setSelectedItem}
            />
          ))}
        </TreeView>

        <Box flex={1}>
          {selectedItem && <ItemDetails item={selectedItem} />}
        </Box>
      </Box>
    </Panel>
  );
};

interface ItemNodeProps {
  item: Item<any>
  onSelect: (item: Item<any>) => void
}

interface ItemDetailsProps {
  item: Item<Model<any>>
}

const ItemDetails = ({ item }: ItemDetailsProps) => (
  <Box sx={{
    '& td': {
      verticalAlign: 'top'
    }
  }}>
    <table>
      <tbody>
        <tr>
          <td style={{ width: 100 }}>ID</td>
          <td>{truncateString(item.id, 8)}</td>
        </tr>
        <tr>
          <td>Model</td>
          <td>{item.model.modelMeta.type}</td>
        </tr>
        <tr>
          <td>Type</td>
          <td>{item.type}</td>
        </tr>
        <tr>
          <td>Properties</td>
          <td>
            <JsonTreeView data={modelToObject(item.model)} />
          </td>
        </tr>
      </tbody>
    </table>
  </Box>
);

const modelToObject = (model: Model<any>) => {
  if (model instanceof ObjectModel) {
    return model.toObject();
  } else if (model instanceof TextModel) {
    return model.textContent;
  } else if (model instanceof MessengerModel) {
    return model.messages;
  }

  return model.toJSON();
};
