// @flow
import type { Node } from 'react';
import React, { Component } from 'react';
import { observer } from 'mobx-react';
import { defineMessages, intlShape } from 'react-intl';
import ReactToolboxMobxForm from '../../../utils/ReactToolboxMobxForm';
import vjf from 'mobx-react-form/lib/validators/VJF';
import globalMessages from '../../../i18n/global-messages';
import config from '../../../config';
import { InputOwnSkin } from '../../../themes/skins/InputOwnSkin';
import { Input } from 'react-polymorph/lib/components/Input';
import isHexadecimal from 'validator/lib/isHexadecimal';
import type { $npm$ReactIntl$IntlFormat } from 'react-intl';

const messages = defineMessages({
  masterKeyInputLabel: {
    id: 'transfer.form.masterkey.input.label',
    defaultMessage: '!!!Master key',
  },
});

const daedalusMasterKeyLength = 192; // 96 bytes (2x because of hex representation)

type Props = {|
  +setForm: ReactToolboxMobxForm => void,
  +classicTheme: boolean,
|};

@observer
export default class DaedalusMasterKeyInput extends Component<Props> {

  static contextTypes: {|intl: $npm$ReactIntl$IntlFormat|} = {
    intl: intlShape.isRequired
  };

  form: ReactToolboxMobxForm = new ReactToolboxMobxForm({
    fields: {
      masterKey: {
        label: this.context.intl.formatMessage(messages.masterKeyInputLabel),
        placeholder: this.props.classicTheme ?
          this.context.intl.formatMessage(messages.masterKeyInputLabel) : '',
        value: '',
        validators: [({ field }) => {
          const value = field.value;
          if (value === '') {
            return [false, this.context.intl.formatMessage(globalMessages.fieldIsRequired)];
          }
          if (value.length !== daedalusMasterKeyLength) {
            return [
              false,
              this.context.intl.formatMessage(globalMessages.invalidKeyLengthLabel, {
                length: daedalusMasterKeyLength,
              })
            ];
          }
          if (!isHexadecimal(value)) {
            return [false, this.context.intl.formatMessage(globalMessages.invalidKeyFormatLabel)];
          }
          return true;
        }],
      },
    },
  }, {
    options: {
      validateOnChange: true,
      validationDebounceWait: config.forms.FORM_VALIDATION_DEBOUNCE_WAIT,
    },
    plugins: {
      vjf: vjf()
    },
  });

  componentDidMount(): void {
    this.props.setForm(this.form);
  }

  render(): Node {
    const { form } = this;

    const masterKeyField = form.$('masterKey');

    return (
      <Input
        className="masterKey"
        autoComplete="off"
        {...masterKeyField.bind()}
        error={masterKeyField.error}
        skin={InputOwnSkin}
        done={masterKeyField.isValid}
      />
    );
  }
}