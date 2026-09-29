#include <Arduino.h>
#include <stdio.h>
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include "esp_log.h"
#include "driver/gpio.h"
#include "esp_timer.h"
#define LED 2
#define PWM 4
#define AnalogInput 34
int sensorValue = 0;
byte duty_cycle = 0;
byte incomingByte = 0;
float manipulation = 0;
void setup() {
  Serial.begin(9600); // opens serial port, sets data rate to 9600 bps
  pinMode(PWM, OUTPUT);
  pinMode(LED, OUTPUT);
  }
void loop() {
  if (Serial.available() > 0) {
    digitalWrite(LED, 1);
    incomingByte = Serial.read(); // read the incoming byte:
    if (incomingByte == 255){ 
      sensorValue = analogRead(AnalogInput); 
      Serial.write((sensorValue >> 8) & 0xFF); // Send the upper byte first
      Serial.write((sensorValue & 0xFF)); // Send the lower byte after
    }else{
      manipulation=map(incomingByte, 0, 100, 0, 255);
      duty_cycle=manipulation;
      analogWrite(PWM, duty_cycle);
    }
    Serial.flush();
    digitalWrite(LED, 0);
  }
}
