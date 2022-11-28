import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/material.dart';
import 'package:flutter_form_builder/flutter_form_builder.dart';
import 'package:form_builder_validators/form_builder_validators.dart';
import 'package:phone_form_field/phone_form_field.dart';
import 'package:smsalert/smsalert.dart';

import '../src/custom/custom_text.dart';
import '../src/whatIDo/data.dart';

class Join extends StatelessWidget {
  Join({Key? key}) : super(key: key);
  List<PhoneNumberInputValidator> validators = [];
  final _formKey = GlobalKey<FormBuilderState>();
  late PhoneController controller = PhoneController(
      const PhoneNumber(isoCode: IsoCode.US, nsn: '8280000000'));

  SMSAlert sms = const SMSAlert('nieman', 'x&nem!ZcVhNXL8');

  final List<List<String>> data = whatIdo();
  static final whatIDoKey = GlobalKey();

  @override
  Widget build(BuildContext context) {
    final double height = MediaQuery.of(context).size.height;
    final double width = MediaQuery.of(context).size.width;
    return Padding(
      padding: const EdgeInsets.all(8.0),
      child: Column(children: <Widget>[
        Container(
          padding: EdgeInsets.only(bottom: height * 0.04),
          width: width * 0.9,
          alignment: Alignment.topLeft,
          child: Text(
            'BE IN THE KNOW',
            style: TextStyle(
                fontFamily: 'SourceCodePro',
                letterSpacing: 10.5,
                color: Theme.of(context).primaryColorLight,
                fontSize: 20),
          ),
        ),
        Padding(
          padding: EdgeInsets.only(bottom: height * 0.1),
          child: LayoutBuilder(
              builder: (BuildContext context, BoxConstraints constraints) {
            return Center(
                child: Container(
              constraints: const BoxConstraints(minWidth: 300, maxWidth: 700),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(70, 10, 70, 20),
                    child: CustomText(
                        text: 'JOIN THE LIST TO FIND OUT ABOUT FUTURE EVENTS:',
                        fontSize: 25,
                        color: Theme.of(context).primaryColorLight),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(70, 10, 70, 20),
                    child: FormBuilder(
                      key: _formKey,
                      onChanged: () {
                        _formKey.currentState!.save();
                        validateInput();
                      },
                      child: Column(
                        children: [
                          Padding(
                            padding: const EdgeInsets.fromLTRB(0, 10, 0, 20),
                            child: FormBuilderTextField(
                              name: 'phone',
                              autovalidateMode: AutovalidateMode.always,
                              style: const TextStyle(color: Colors.white),
                              decoration: const InputDecoration(
                                  labelText: 'NAME',
                                  labelStyle: TextStyle(color: Colors.white),
                                  enabledBorder: OutlineInputBorder(
                                    borderSide: BorderSide(color: Colors.white),
                                  ),
                                  border: OutlineInputBorder(
                                    borderSide: BorderSide(color: Colors.white),
                                  ),
                                  helperText: 'INPUT YOUR NAME/NICKNAME',
                                  fillColor: Colors.white,
                                  helperStyle:
                                      TextStyle(color: Colors.white30)),
                              cursorColor: Colors.white,
                              keyboardType: TextInputType.name,
                              validator: FormBuilderValidators.compose([
                                FormBuilderValidators.required(),
                                FormBuilderValidators.max(64),
                              ]),
                            ),
                          ),
                          PhoneFormField(
                            controller: controller,
                            key: const Key('phone-field'),
                            style: const TextStyle(color: Colors.white),
                            decoration: const InputDecoration(
                                labelText: 'PHONE', // default to null
                                labelStyle: TextStyle(color: Colors.white),
                                helperText: 'USA NUMBERS ONLY',
                                helperStyle: TextStyle(color: Colors.white30),
                                enabledBorder: OutlineInputBorder(
                                  borderSide: BorderSide(color: Colors.white),
                                ),
                                border: OutlineInputBorder(
                                  borderSide: BorderSide(color: Colors.white),
                                )),
                            validator: _getValidator(true),
                            isCountrySelectionEnabled: false, // default
                            // countrySelectorNavigator:
                            //     const CountrySelectorNavigator.bottomSheet(),
                            showFlagInInput: false, // default
                            autofillHints: const [
                              AutofillHints.telephoneNumber
                            ], // default
                            //onSaved: (PhoneNumber p) => print('saved $p'),   // default null
                            //onChanged: (PhoneNumber p) => print('saved $p'),
                          ),
                        ],
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(bottom: 25.0),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceAround,
                      children: [
                        Column(
                          children: [
                            ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                  primary:
                                      Theme.of(context).scaffoldBackgroundColor,
                                  shadowColor:
                                      const Color.fromARGB(255, 175, 174, 174),
                                  textStyle: const TextStyle(
                                      fontSize: 30,
                                      color:
                                          Color.fromARGB(255, 192, 190, 190))),
                              onPressed: () async {
                                var validator = _getValidator(true);
                                if (_formKey.currentState != null) {
                                  if (_formKey.currentState
                                          ?.saveAndValidate() ??
                                      false) {
                                    if (controller.value!
                                        .isValid(type: PhoneNumberType.mobile))
                                      await signupSMS(
                                          _formKey.currentState!.value
                                              .toString(),
                                          controller.value!.international);
                                  }
                                }
                              },
                              child: const Text('JOIN'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ));
          }),
        )
      ]),
    );
  }

  Future signupSMS(String name, String phoneNumber) async {
    await FirebaseAnalytics.instance.logEvent(
      name: 'sms_signup',
      parameters: {
        'name': name,
        'phone_number': phoneNumber,
      },
    );
    var message1 = await sms.messages.createcontact(
        {'grpname': 'pluto', 'name': name, 'number': phoneNumber});
    var message = await sms.messages.sendsms({
      'text':
          'Hey $name Welcome Pluto... stay tuned here for future events.', //SMS text
      'sender': 'CVDEMO', // a valid sender ID
      'mobileno': phoneNumber, // your destination phone number
      'route': 'demo' //to select route
    });
    await FirebaseAnalytics.instance.logEvent(
      name: 'sms_signup_response',
      parameters: {
        'name': name,
        'phone_number': phoneNumber,
        'message': message.toString()
      },
    );
  }

  PhoneNumberInputValidator? _getValidator(bool mobileOnly) {
    if (mobileOnly) {
      validators.add(PhoneValidator.validMobile());
    } else {
      validators.add(PhoneValidator.valid());
    }
    return validators.isNotEmpty ? PhoneValidator.compose(validators) : null;
  }

  void validateInput() {}
}
