/* eslint-disable no-nested-ternary */
// @flow
import React, { Component } from 'react';
import type { Node } from 'react';
import { intlShape } from 'react-intl';
import type { $npm$ReactIntl$IntlFormat } from 'react-intl';
import styles from './SignTxPage.scss';
import { Button } from 'react-polymorph/lib/components/Button';
import { ButtonSkin } from 'react-polymorph/lib/skins/simple/ButtonSkin';
import { Input } from 'react-polymorph/lib/components/Input';
import { InputOwnSkin } from '../../../themes/skins/InputOwnSkin';
import globalMessages from '../../../i18n/global-messages';
import { observer } from 'mobx-react';
import CopyableAddress from '../../../components/widgets/CopyableAddress';
import RawHash from '../../../components/widgets/hashWrappers/RawHash';
import config from '../../../config';
import vjf from 'mobx-react-form/lib/validators/VJF';
import ReactToolboxMobxForm from '../../../utils/ReactToolboxMobxForm';
import { handleExternalLinkClick } from '../../../utils/routing';
import ExplorableHash from '../../../components/widgets/hashWrappers/ExplorableHash';
import type { Notification } from '../../../types/notificationType';
import { truncateAddressShort, truncateToken } from '../../../utils/formatters';
import ProgressBar from '../ProgressBar';
import type { Tx } from '../../../../chrome/extension/ergo-connector/types';
import type { DefaultTokenEntry, TokenLookupKey } from '../../../api/common/lib/MultiToken';
import type { NetworkRow, TokenRow } from '../../../api/ada/lib/storage/database/primitives/tables';
import { getTokenName, genFormatTokenAmount } from '../../../stores/stateless/tokenHelpers';
import BigNumber from 'bignumber.js';
import { RustModule } from '../../../api/ada/lib/cardanoCrypto/rustLoader';

type Props = {|
  +totalAmount: ?BigNumber,
  +txData: Tx,
  +onCopyAddressTooltip: (string, string) => void,
  +onCancel: () => void,
  +onConfirm: string => void,
  +notification: ?Notification,
  +getTokenInfo: $ReadOnly<Inexact<TokenLookupKey>> => $ReadOnly<TokenRow>,
  +defaultToken: DefaultTokenEntry,
  +network: $ReadOnly<NetworkRow>,
|};

// TODO: get explorer from user settings
const URL_WEBSITE = 'https://explorer.ergoplatform.com/en/addresses/';

@observer
class SignTxPage extends Component<Props> {
  static contextTypes: {| intl: $npm$ReactIntl$IntlFormat |} = {
    intl: intlShape.isRequired,
  };

  form: ReactToolboxMobxForm = new ReactToolboxMobxForm(
    {
      fields: {
        walletPassword: {
          type: 'password',
          label: this.context.intl.formatMessage(globalMessages.walletPasswordLabel),
          placeholder: this.context.intl.formatMessage(
            globalMessages.walletPasswordFieldPlaceholder
          ),
          value: '',
          validators: [
            ({ field }) => {
              if (field.value === '') {
                return [false, this.context.intl.formatMessage(globalMessages.fieldIsRequired)];
              }
              return [true];
            },
          ],
        },
      },
    },
    {
      options: {
        validateOnChange: true,
        validationDebounceWait: config.forms.FORM_VALIDATION_DEBOUNCE_WAIT,
      },
      plugins: {
        vjf: vjf(),
      },
    }
  );

  submit(): void {
    this.form.submit({
      onSuccess: form => {
        const { walletPassword } = form.values();
        this.props.onConfirm(walletPassword);
      },
      onError: () => {},
    });
  }

  render(): Node {
    const { form } = this;
    const walletPasswordField = form.$('walletPassword');

    const { intl } = this.context;
    const { txData, onCopyAddressTooltip, onCancel, notification, totalAmount } = this.props;

    const formatValue = genFormatTokenAmount(this.props.getTokenInfo);
    const defaultTokenEntry = {
      identifier: this.props.defaultToken.defaultIdentifier,
      networkId: this.props.defaultToken.defaultNetworkId,
    };
    const defaultTokenInfo = this.props.getTokenInfo(defaultTokenEntry);

    const chainNetworkId = (Number.parseInt(
      this.props.network.BaseConfig[0].ChainNetworkId, 10
    ): any);
    const genAddress: string => string = (ergoTree) => {
      return RustModule.SigmaRust.NetworkAddress.new(
        chainNetworkId,
        RustModule.SigmaRust.Address.recreate_from_ergo_tree(
          RustModule.SigmaRust.ErgoTree.from_base16_bytes(
            ergoTree
          )
        )
      ).to_base58();
    }
    return (
      <>
        <ProgressBar step={2} />
        <div className={styles.component}>
          <div className={styles.row}>
            <p className={styles.label}>{intl.formatMessage(globalMessages.transactionId)}</p>
            <p className={styles.value}>{txData.id}</p>
          </div>
          <div className={styles.details}>
            <div>
              <p className={styles.label}>{intl.formatMessage(globalMessages.amount)}</p>
              {txData.outputs.map(({ value, assets, boxId }) => {
                return (
                  <div className={styles.amountRow} key={boxId}>
                    <p className={styles.amount}>
                      {formatValue({
                        ...defaultTokenEntry,
                        amount: new BigNumber(value),
                      })} {truncateToken(getTokenName(defaultTokenInfo))}
                    </p>
                    {assets && assets.length ? (
                      assets.map(({ tokenId, amount }) => {
                        const tokenInfoEntry = {
                          networkId: this.props.defaultToken.defaultNetworkId,
                          identifier: tokenId,
                        };
                        const tokenInfo = this.props.getTokenInfo(tokenInfoEntry);
                        return (
                          <p className={styles.stablecoins} key={tokenId}>
                            {formatValue({
                              ...tokenInfoEntry,
                              amount: new BigNumber(amount),
                            })} {truncateToken(getTokenName(tokenInfo))}
                          </p>
                        );
                      })
                    ) : (<></>)}
                  </div>
                );
              })}
            </div>
            <div className={styles.transactionFee}>
              {/* TODO: Fee value */}
              {/* <p className={styles.label}>{intl.formatMessage(globalMessages.feeLabel)}</p> */}
              {/* <p className={styles.amount}>5.050088 ERG</p> */}
            </div>
          </div>
          <div className={styles.row}>
            <p className={styles.label}>
              {intl.formatMessage(globalMessages.walletSendConfirmationTotalLabel)}
            </p>
            <p className={styles.totalValue}>
              {formatValue({
                ...defaultTokenEntry,
                amount: totalAmount ?? new BigNumber(0),
              })} {truncateToken(getTokenName(defaultTokenInfo))}
            </p>
          </div>
          <div className={styles.address}>
            <div className={styles.addressFrom}>
              <p className={styles.label}>
                {intl.formatMessage(globalMessages.fromAddresses)}:{' '}
                <span>{txData.inputs.length}</span>
              </p>
              <div className={styles.addressFromList}>
                {txData.inputs.map((address, index) => {
                  const notificationElementId = `ergo-input-${index}`;
                  const addressBase58 = genAddress(address.ergoTree);
                  return (
                    <div className={styles.addressToItem} key={address.boxId}>
                      <CopyableAddress
                        hash={addressBase58}
                        elementId={notificationElementId}
                        onCopyAddress={() =>
                          onCopyAddressTooltip(addressBase58, notificationElementId)
                        }
                        notification={notification}
                      >
                        <ExplorableHash
                          light={false}
                          websiteName="ErgoPlatform Blockchain Explorer"
                          url={URL_WEBSITE + addressBase58}
                          onExternalLinkClick={handleExternalLinkClick}
                        >
                          <RawHash light={false}>
                            <span className={styles.addressHash}>
                              {truncateAddressShort(addressBase58)}
                            </span>
                          </RawHash>
                        </ExplorableHash>
                      </CopyableAddress>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className={styles.addressTo}>
              <p className={styles.label}>
                {intl.formatMessage(globalMessages.toAddresses)}:{' '}
                <span>{txData.outputs.length}</span>
              </p>
              <div className={styles.addressToList}>
                {txData.outputs.map((address, index) => {
                  const notificationElementId = `address-output-${index}-copyNotification`;
                  const addressBase58 = genAddress(address.ergoTree);
                  return (
                    <div className={styles.addressToItem} key={address.boxId}>
                      <CopyableAddress
                        hash={addressBase58}
                        elementId={notificationElementId}
                        onCopyAddress={() =>
                          onCopyAddressTooltip(addressBase58, notificationElementId)
                        }
                        notification={notification}
                      >
                        <ExplorableHash
                          light={false}
                          websiteName="ErgoPlatform Blockchain Explorer"
                          url={URL_WEBSITE + addressBase58}
                          onExternalLinkClick={handleExternalLinkClick}
                        >
                          <RawHash light={false}>
                            <span className={styles.addressHash}>
                              {truncateAddressShort(addressBase58)}
                            </span>
                          </RawHash>
                        </ExplorableHash>
                      </CopyableAddress>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className={styles.passwordInput}>
            <Input
              type="password"
              className={styles.walletPassword}
              {...walletPasswordField.bind()}
              error={walletPasswordField.error}
              skin={InputOwnSkin}
            />
          </div>
          <div className={styles.wrapperBtn}>
            <Button
              className="secondary"
              label={intl.formatMessage(globalMessages.cancel)}
              skin={ButtonSkin}
              onClick={onCancel}
            />
            <Button
              label={intl.formatMessage(globalMessages.confirm)}
              skin={ButtonSkin}
              disabled={!walletPasswordField.isValid}
              onClick={this.submit.bind(this)}
            />
          </div>
        </div>
      </>
    );
  }
}

export default SignTxPage;
