# -*- coding: utf-8 -*-

import tensorflow as tf
import json
import numpy as np

with open('../data/procedure-learning-data-input.json') as learning_data_input_file:
    x = json.load(learning_data_input_file)
with open('../data/procedure-learning-data-output.json') as learning_data_output_file:
    y = json.load(learning_data_output_file)

x_train = []
x_val = []
x_test = []
y_train = []
y_val = []
y_test = []
for i in range(len(x)):
    if i % 5 == 0:
        if i % 2 == 0:
            x_val.append(x[i])
            y_val.append(y[i])
        else:
            x_test.append(x[i])
            y_test.append(y[i])
    else:
        x_train.append(x[i])
        y_train.append(y[i])
x_train = np.array(x_train)
x_val = np.array(x_val)
x_test = np.array(x_test)

model = tf.keras.models.Sequential()
model.add(tf.keras.layers.Dense(32, input_dim=102, activation='relu'))
model.add(tf.keras.layers.Dropout(0.5))
model.add(tf.keras.layers.Dense(1, activation='sigmoid'))

model.compile(loss='binary_crossentropy', optimizer='rmsprop', metrics=['accuracy'])
tb = tf.keras.callbacks.TensorBoard(log_dir='../data/tf-log', histogram_freq=0, write_graph=True, write_images=True)

history = model.fit(x_train, y_train, epochs=40, batch_size=128, validation_data=(x_val, y_val), callbacks=[tb])
score = model.evaluate(x_test, y_test)
print('Test loss:', score[0])
print('Test accuracy:', score[1])

model.save('../data/procedure-model.h5')
