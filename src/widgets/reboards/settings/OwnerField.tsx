import React, {useCallback, useEffect, useRef, useState} from 'react';
import Select, {type SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import confirm from '@jetbrains/ring-ui-built/components/confirm-service/confirm-service';
import alertService from '@jetbrains/ring-ui-built/components/alert-service/alert-service';
import {errorMessage} from '@/common/youtrack/rest';
import {youtrack} from '../data/api';

const SEARCH_DELAY_MS = 250;

type Props = {
  owner: string;
  canTransfer: boolean;
  onTransfer: (login: string) => Promise<void>;
};

/** Shows the board owner and, for those allowed, a user picker that hands the board over. */
export const OwnerField: React.FC<Props> = ({owner, canTransfer, onTransfer}) => {
  const [users, setUsers] = useState<SelectItem[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((query: string) => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const found = await youtrack.searchUsers(query);
        setUsers(found.filter(u => u.login !== owner).map(u => ({key: u.login, label: u.fullName || u.login, description: u.login, avatar: u.avatarUrl})));
      } catch (error) {
        alertService.error(`Could not load users: ${errorMessage(error)}`);
      } finally {
        setLoading(false);
      }
    }, SEARCH_DELAY_MS);
  }, [owner]);

  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
  }, []);

  const transfer = useCallback(async (item: SelectItem | null) => {
    if (!item) {
      return;
    }
    const login = String(item.key);
    try {
      await confirm({text: `Make ${login} the owner of this board? You may lose the right to change it.`, confirmLabel: 'Transfer', rejectLabel: 'Cancel'});
    } catch {
      return;
    }
    try {
      await onTransfer(login);
      alertService.successMessage(`${login} now owns the board`);
    } catch (error) {
      alertService.error(`Could not transfer the board: ${errorMessage(error)}`);
    }
  }, [onTransfer]);

  return (
    <div className="settings-field">
      <span className="settings-field__label">Owner</span>
      <div className="settings-owner">
        <span>{owner || '(unknown)'}</span>
        {canTransfer && (
          <Select
            type={Select.Type.BUTTON}
            label="Transfer ownership"
            filter={{placeholder: 'Search users'}}
            loading={loading}
            data={users}
            selected={null}
            onOpen={() => search('')}
            onFilter={search}
            onChange={transfer}
          />
        )}
      </div>
    </div>
  );
};
