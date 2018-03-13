# -*- coding: utf-8 -*-

from keras.models import Sequential
from keras.layers import Dense, Dropout
import matplotlib.pyplot as plt
import json
import numpy as np
from keras.callbacks import TensorBoard

with open('./data/procedure-learning-data-input.json') as learning_data_input_file:
    x = json.load(learning_data_input_file)
with open('./data/procedure-learning-data-output.json') as learning_data_output_file:
    y = json.load(learning_data_output_file)

x_train = []
x_test = []
y_train = []
y_test = []
for i in range(len(x)):
    if i % 5 == 0:
        x_test.append(x[i])
        y_test.append(y[i])
    else:
        x_train.append(x[i])
        y_train.append(y[i])
x_train = np.array(x_train)
x_test = np.array(x_test)

model = Sequential()
model.add(Dense(32, input_dim=102, activation='relu'))
model.add(Dropout(0.5))
model.add(Dense(1, activation='sigmoid'))

model.compile(loss='binary_crossentropy', optimizer='rmsprop', metrics=['accuracy'])
tb = TensorBoard(log_dir='./data/keras-log', histogram_freq=0, write_graph=True, write_images=True)

history = model.fit(x_train, y_train, epochs=40, batch_size=128, validation_data=(x_test, y_test), callbacks=[tb])
score = model.evaluate(x_test, y_test)
print('Test loss:', score[0])
print('Test accuracy:', score[1])

model.save('./data/procedure-model.h5')

#Accuracy
plt.plot(history.history['acc'])
plt.plot(history.history['val_acc'])
plt.title('model accuracy')
plt.ylabel('accuracy')
plt.xlabel('epoch')
plt.legend(['train', 'test'], loc='upper left')
plt.show()

#loss
plt.plot(history.history['loss'])
plt.plot(history.history['val_loss'])
plt.title('model loss')
plt.ylabel('loss')
plt.xlabel('epoch')
plt.legend(['train', 'test'], loc='upper left')
plt.show()
