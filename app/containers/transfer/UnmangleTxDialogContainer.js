// @flow
import React, { Component } from 'react';
import type { Node } from 'react';
import { observer } from 'mobx-react';
import { action, computed, observable } from 'mobx';
import { intlShape, } from 'react-intl';
import ReactToolboxMobxForm from '../../utils/ReactToolboxMobxForm';
import type { InjectedOrGenerated } from '../../types/injectedPropsType';
import LegacyTransferLayout from '../../components/transfer/LegacyTransferLayout';
import TransferSummaryPage from '../../components/transfer/TransferSummaryPage';
import YoroiTransferErrorPage from './YoroiTransferErrorPage';
import VerticallyCenteredLayout from '../../components/layout/VerticallyCenteredLayout';
import Dialog from '../../components/widgets/Dialog';
import LoadingSpinner from '../../components/widgets/LoadingSpinner';
import environment from '../../environment';
import { formattedWalletAmount } from '../../utils/formatters';
import { IGetFee, IReceivers, ITotalInput } from '../../api/ada/transactions/utils';
import { RustModule } from '../../api/ada/lib/cardanoCrypto/rustLoader';
import type { BaseSignRequest } from '../../api/ada/transactions/types';
import {
  asHasUtxoChains,
} from '../../api/ada/lib/storage/models/PublicDeriver/traits';
import SpendingPasswordInput from '../../components/widgets/forms/SpendingPasswordInput';
import { addressToDisplayString, getAddressPayload } from '../../api/ada/lib/storage/bridge/utils';
import globalMessages from '../../i18n/global-messages';
import type { ConfigType } from '../../../config/config-types';
import type { $npm$ReactIntl$IntlFormat } from 'react-intl';

declare var CONFIG: ConfigType;

export type GeneratedData = typeof UnmangleTxDialogContainer.prototype.generated;

type Props = {|
  ...InjectedOrGenerated<GeneratedData>,
  +onClose: void => void,
|};

@observer
export default class UnmangleTxDialogContainer extends Component<Props> {

  static contextTypes: {|intl: $npm$ReactIntl$IntlFormat|} = {
    intl: intlShape.isRequired,
  };

  @observable spendingPasswordForm: void | ReactToolboxMobxForm;

  @action
  setSpendingPasswordForm(form: ReactToolboxMobxForm) {
    this.spendingPasswordForm = form;
  }

  componentDidMount() {
    const selected = this._getWalletsStore().selected;
    if (selected == null) {
      throw new Error(`${nameof(UnmangleTxDialogContainer)} no wallet selected`);
    }
    const withChains = asHasUtxoChains(selected);
    if (withChains == null) {
      throw new Error(`${nameof(UnmangleTxDialogContainer)} no chains`);
    }

    const filterTo = new Set(
      this.generated.stores.substores.ada.addresses.mangledAddressesForDisplay.all
        // we don't want to include any UTXO that would do nothing but increase the tx fee
        .filter(info => info.value != null && info.value.gt(CONFIG.genesis.linearFee.coefficient))
        .map(info => getAddressPayload(info.address))
    );

    this.generated.stores.substores.ada.transactionBuilderStore.setupSelfTx.execute({
      publicDeriver: withChains,
      /**
       * We filter to only UTXOs of mangled addresses
       * this ensures that the tx fee is also paid by a UTXO of a mangled address
       */
      filter: utxo => filterTo.has(utxo.address),
    });
  }

  componentWillUnmount() {
    const builderActions = this.generated.actions.ada.txBuilderActions;
    builderActions.reset.trigger();
    this._getAdaWalletsStore().sendMoneyRequest.reset();
  }

  submit: void => Promise<void> = async () => {
    const selected = this._getWalletsStore().selected;
    if (selected == null) {
      throw new Error(`${nameof(UnmangleTxDialogContainer)} no wallet selected`);
    }
    if (this.spendingPasswordForm == null) {
      throw new Error(`${nameof(UnmangleTxDialogContainer)} form not set`);
    }
    this.spendingPasswordForm.submit({
      onSuccess: async (form) => {
        const { walletPassword } = form.values();

        const txBuilderStore = this._getTxBuilderStore();
        if (txBuilderStore.tentativeTx == null) return;
        await this.generated.actions.ada.wallets.sendMoney.trigger({
          signRequest: txBuilderStore.tentativeTx,
          password: walletPassword,
          publicDeriver: selected,
        });
      },
      onError: () => {}
    });
  };

  render(): Node {
    const txBuilder = this._getTxBuilderStore();

    if (txBuilder.setupSelfTx.error != null) {
      return (
        <YoroiTransferErrorPage
          error={txBuilder.setupSelfTx.error}
          onCancel={this.props.onClose}
          classicTheme={this.generated.stores.profile.isClassicTheme}
        />
      );
    }

    if (txBuilder.tentativeTx == null) {
      return this.getSpinner();
    }
    const tentativeTx = txBuilder.tentativeTx;
    return this.getContent(tentativeTx);
  }

  getSpinner: void => Node = () => {
    const { intl } = this.context;
    return (
      <Dialog
        title={intl.formatMessage(globalMessages.processingLabel)}
        closeOnOverlayClick={false}
      >
        <LegacyTransferLayout>
          <VerticallyCenteredLayout>
            <LoadingSpinner />
          </VerticallyCenteredLayout>
        </LegacyTransferLayout>
      </Dialog>
    );
  }

  getContent: BaseSignRequest<
    RustModule.WalletV2.Transaction | RustModule.WalletV3.InputOutput
  > => Node = (
    tentativeTx
  ) => {
    const coinPrice: ?number = this.generated.stores.profile.unitOfAccount.enabled
      ? (
        this.generated.stores.coinPriceStore
          .getCurrentPrice('ADA', this.generated.stores.profile.unitOfAccount.currency)
      )
      : null;

    const transferTx = {
      recoveredBalance: ITotalInput(tentativeTx, true),
      fee: IGetFee(tentativeTx, true),
      senders: Array.from(new Set(tentativeTx.senderUtxos.map(utxo => utxo.receiver)))
        .map(addr => addressToDisplayString(addr)),
      receiver: IReceivers(tentativeTx, false)
        .map(addr => addressToDisplayString(addr))[0],
    };

    const spendingPasswordForm = (<SpendingPasswordInput
      setForm={(form) => this.setSpendingPasswordForm(form)}
      classicTheme={this.generated.stores.profile.isClassicTheme}
      isSubmitting={this._getAdaWalletsStore().sendMoneyRequest.isExecuting}
    />);

    const { intl } = this.context;

    return (
      <TransferSummaryPage
        form={spendingPasswordForm}
        formattedWalletAmount={formattedWalletAmount}
        selectedExplorer={this.generated.stores.profile.selectedExplorer}
        transferTx={transferTx}
        onSubmit={this.submit}
        isSubmitting={this._getAdaWalletsStore().sendMoneyRequest.isExecuting}
        onCancel={this.props.onClose}
        error={this._getAdaWalletsStore().sendMoneyRequest.error}
        dialogTitle={intl.formatMessage(globalMessages.walletSendConfirmationDialogTitle)}
        coinPrice={coinPrice}
        unitOfAccountSetting={this.generated.stores.profile.unitOfAccount}
      />
    );
  }

  _getWalletsStore() {
    return this.generated.stores.wallets;
  }

  _getAdaWalletsStore() {
    return this.generated.stores.substores[environment.API].wallets;
  }

  _getTxBuilderStore() {
    return this.generated.stores.substores.ada.transactionBuilderStore;
  }

  @computed get generated() {
    if (this.props.generated !== undefined) {
      return this.props.generated;
    }
    if (this.props.stores == null || this.props.actions == null) {
      throw new Error(`${nameof(UnmangleTxDialogContainer)} no way to generated props`);
    }
    const { stores, actions } = this.props;
    return Object.freeze({
      stores: {
        profile: {
          isClassicTheme: stores.profile.isClassicTheme,
          selectedExplorer: stores.profile.selectedExplorer,
          unitOfAccount: stores.profile.unitOfAccount,
        },
        wallets: {
          selected: stores.wallets.selected,
        },
        coinPriceStore: {
          getCurrentPrice: stores.substores.ada.coinPriceStore.getCurrentPrice,
        },
        substores: {
          ada: {
            wallets: {
              sendMoneyRequest: {
                reset: stores.substores.ada.wallets.sendMoneyRequest.reset,
                error: stores.substores.ada.wallets.sendMoneyRequest.error,
                isExecuting: stores.substores.ada.wallets.sendMoneyRequest.isExecuting,
              },
            },
            addresses: {
              mangledAddressesForDisplay: {
                all: stores.substores.ada.addresses.mangledAddressesForDisplay.all,
              },
            },
            transactionBuilderStore: {
              tentativeTx: stores.substores.ada.transactionBuilderStore.tentativeTx,
              setupSelfTx: {
                execute: stores.substores.ada.transactionBuilderStore.setupSelfTx.execute,
                error: stores.substores.ada.transactionBuilderStore.setupSelfTx.error,
              },
            },
          },
        },
      },
      actions: {
        ada: {
          txBuilderActions: {
            reset: {
              trigger: actions.ada.txBuilderActions.reset.trigger
            },
          },
          wallets: {
            sendMoney: {
              trigger: actions.ada.wallets.sendMoney.trigger
            },
          },
        },
      },
    });
  }
}
