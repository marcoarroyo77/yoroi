// @flow
import React, { Component } from 'react';
import { observer } from 'mobx-react';
import config from '../../../config';
import validWords from 'bip39/src/wordlists/english.json';
import WalletRestoreDialog from '../../../components/wallet/WalletRestoreDialog';
import WalletRestoreVerifyDialog from '../../../components/wallet/WalletRestoreVerifyDialog';
import type { WalletRestoreDialogValues } from '../../../components/wallet/WalletRestoreDialog';
import type { InjectedDialogContainerProps } from '../../../types/injectedPropsType';
import environment from '../../../environment';
import {
  unscramblePaperAdaMnemonic,
} from '../../../api/ada/lib/cardanoCrypto/paperWallet';
import {
  generateStandardPlate,
} from '../../../api/ada/lib/cardanoCrypto/plate';
import type { WalletAccountNumberPlate } from '../../../api/ada/lib/storage/models/PublicDeriver/interfaces';
import globalMessages from '../../../i18n/global-messages';
import { CheckAdressesInUseApiError } from '../../../api/ada/errors';
import type {
  ConfigType,
} from '../../../../config/config-types';

declare var CONFIG : ConfigType;
const protocolMagic = CONFIG.network.protocolMagic;

type Props = {|
  ...InjectedDialogContainerProps,
  +mode: "regular" | "paper",
  +introMessage?: string,
  +onBack: void => void,
|};

const NUMBER_OF_VERIFIED_ADDRESSES = 1;
const NUMBER_OF_VERIFIED_ADDRESSES_PAPER = 5;

type WalletRestoreDialogContainerState = {|
  verifyRestore?: {|
    addresses: Array<string>,
    accountPlate: WalletAccountNumberPlate,
  |},
  submitValues?: WalletRestoreDialogValues,
  resolvedRecoveryPhrase?: string,
  notificationElementId: string,
|}

@observer
export default class WalletRestoreDialogContainer
  extends Component<Props, WalletRestoreDialogContainerState> {

  static defaultProps = {
    introMessage: undefined
  };

  state = {
    verifyRestore: undefined,
    submitValues: undefined,
    resolvedRecoveryPhrase: undefined,
    notificationElementId: '',
  };

  onVerifiedSubmit = () => {
    const { submitValues, resolvedRecoveryPhrase } = this.state;
    if (!submitValues) {
      throw new Error('Cannot submit wallet restoration! No values are available in context!');
    }
    if (resolvedRecoveryPhrase != null) {
      submitValues.recoveryPhrase = resolvedRecoveryPhrase;
    }
    this.props.actions[environment.API].wallets.restoreWallet.trigger({
      recoveryPhrase: submitValues.recoveryPhrase,
      walletName: submitValues.walletName,
      walletPassword: submitValues.walletPassword
    });
  };

  onSubmit = (values: WalletRestoreDialogValues) => {
    const isPaper = isPaperMode(this.props.mode);
    let resolvedRecoveryPhrase = values.recoveryPhrase;
    if (isPaper) {
      const [newPhrase] = unscramblePaperAdaMnemonic(
        values.recoveryPhrase,
        getWordsCount(this.props.mode),
        values.paperPassword
      );
      if (newPhrase == null) {
        throw new Error('Failed to restore a paper wallet! Invalid recovery phrase!');
      }
      resolvedRecoveryPhrase = newPhrase;
    }
    const { addresses, accountPlate } =  generateStandardPlate(
      resolvedRecoveryPhrase,
      0, // show addresses for account #0
      isPaper ? NUMBER_OF_VERIFIED_ADDRESSES_PAPER : NUMBER_OF_VERIFIED_ADDRESSES,
      protocolMagic,
    );
    this.setState({
      verifyRestore: { addresses, accountPlate },
      submitValues: values,
      resolvedRecoveryPhrase,
    });
  };

  cancelVerification = () => {
    this.setState({
      verifyRestore: undefined,
      resolvedRecoveryPhrase: undefined,
    });
  };

  onCancel = () => {
    this.props.onClose();
    // Restore request should be reset only in case restore is finished/errored
    const { restoreRequest } = this._getWalletsStore();
    if (!restoreRequest.isExecuting) restoreRequest.reset();
  };

  render() {
    const actions = this.props.actions;
    const { uiNotifications, profile } = this.props.stores;
    const wallets = this._getWalletsStore();
    const { restoreRequest } = wallets;

    const isPaper = isPaperMode(this.props.mode);
    const wordsCount = getWordsCount(this.props.mode);
    if (!isPaper && this.props.mode !== 'regular') {
      throw new Error('Unexpected restore mode: ' + this.props.mode);
    }

    const tooltipNotification = {
      duration: config.wallets.ADDRESS_COPY_TOOLTIP_NOTIFICATION_DURATION,
      message: globalMessages.copyTooltipMessage,
    };

    const { verifyRestore, submitValues } = this.state;
    if (verifyRestore) {
      const { addresses, accountPlate } = verifyRestore;
      // Refer: https://github.com/Emurgo/yoroi-frontend/pull/1055
      let error;
      /**
       * CheckAdressesInUseApiError happens when yoroi could not fetch Used Address.
       * Mostly because internet not connected or yoroi backend is down.
       * At this point wallet is already created in the storage.
       * When internet connection is back, everything will be loaded correctly.
       */
      if (restoreRequest.error instanceof CheckAdressesInUseApiError === false) {
        error = restoreRequest.error;
      }
      const isSubmitting = restoreRequest.isExecuting ||
        (restoreRequest.error instanceof CheckAdressesInUseApiError);
      return (
        <WalletRestoreVerifyDialog
          addresses={addresses}
          accountPlate={accountPlate}
          selectedExplorer={profile.selectedExplorer}
          onNext={this.onVerifiedSubmit}
          onCancel={this.cancelVerification}
          onCopyAddressTooltip={(address, elementId) => {
            if (!uiNotifications.isOpen(elementId)) {
              this.setState({ notificationElementId: elementId });
              actions.notifications.open.trigger({
                id: elementId,
                duration: tooltipNotification.duration,
                message: tooltipNotification.message,
              });
            }
          }}
          notification={uiNotifications.getTooltipActiveNotification(
            this.state.notificationElementId
          )}
          isSubmitting={isSubmitting}
          classicTheme={this.props.classicTheme}
          error={error}
        />
      );
    }

    return (
      <WalletRestoreDialog
        mnemonicValidator={mnemonic => {
          if (isPaper) {
            return wallets.isValidPaperMnemonic({
              mnemonic,
              numberOfWords: wordsCount
            });
          }
          return wallets.isValidMnemonic({
            mnemonic,
            numberOfWords: wordsCount
          });
        }}
        validWords={validWords}
        numberOfMnemonics={wordsCount}
        isSubmitting={restoreRequest.isExecuting}
        onSubmit={this.onSubmit}
        onCancel={this.onCancel}
        onBack={this.props.onBack}
        error={restoreRequest.error}
        isPaper={isPaper}
        showPaperPassword={isPaper}
        classicTheme={this.props.classicTheme}
        initValues={submitValues || undefined}
        introMessage={this.props.introMessage || ''}
      />
    );
  }

  _getWalletsStore() {
    return this.props.stores.substores[environment.API].wallets;
  }
}

function isPaperMode(mode: string): boolean {
  return mode === 'paper';
}

function getWordsCount(mode: string): number {
  return mode === 'paper'
    ? config.wallets.YOROI_PAPER_RECOVERY_PHRASE_WORD_COUNT
    : config.wallets.WALLET_RECOVERY_PHRASE_WORD_COUNT;
}
